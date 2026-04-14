import dotenv from "dotenv";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { buildAiCorsHeaders, verifyAiRequest } from "./_shared/aiProtection.js";

dotenv.config();

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const parseBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const getCorsHeaders = (event = {}) => buildAiCorsHeaders(event);

const jsonResponse = (statusCode, body, event, extraHeaders = {}) => ({
  statusCode,
  headers: {
    ...getCorsHeaders(event),
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const sanitizeString = (value = "", maxLength = 1200) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const sanitizePageContext = (pageContext = {}) => ({
  pathname: sanitizeString(pageContext?.pathname, 240),
  search: sanitizeString(pageContext?.search, 240),
  pageType: sanitizeString(pageContext?.pageType, 80),
  city: sanitizeString(pageContext?.city, 120),
  listingId: sanitizeString(pageContext?.listingId, 120),
  title: sanitizeString(pageContext?.title, 180),
});

const sanitizeCards = (cards = []) =>
  Array.isArray(cards)
    ? cards
        .map((card) => ({
          id: sanitizeId(card?.id, 120),
          title: sanitizeString(card?.title, 220),
          city: sanitizeString(card?.city, 120),
          url: sanitizeString(card?.url, 900),
          images: Array.isArray(card?.images)
            ? card.images.map((image) => sanitizeString(image, 900)).filter(Boolean).slice(0, 3)
            : [],
        }))
        .filter((card) => card.title || card.url)
        .slice(0, 6)
    : [];

const sanitizeQuickReplies = (quickReplies = []) =>
  Array.isArray(quickReplies)
    ? quickReplies
        .map((item) => ({
          id: sanitizeId(item?.id, 120),
          label: sanitizeString(item?.label || item?.message, 120),
          message: sanitizeString(item?.message || item?.label, 240),
        }))
        .filter((item) => item.label && item.message)
        .slice(0, 6)
    : [];

const sanitizeMessagePayload = (message, fallbackRole = "assistant") => {
  if (!message || typeof message !== "object") return null;
  const normalizedRole = sanitizeString(message.role, 20).toLowerCase();
  const role = normalizedRole === "user" ? "user" : fallbackRole;
  const content = sanitizeString(message.content, 3000);
  if (!content) return null;

  return {
    id: sanitizeId(message.id, 120),
    role,
    content,
    cards: sanitizeCards(message.cards),
    quickReplies: sanitizeQuickReplies(message.quickReplies),
    senderType: sanitizeString(message.senderType, 40).toLowerCase(),
    senderName: sanitizeString(message.senderName, 160),
    senderEmail: sanitizeString(message.senderEmail, 160),
  };
};

const normalizeRating = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "good") return "good";
  if (normalized === "bad") return "bad";
  return "";
};

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

const getSourceOrigin = (event = {}) => {
  const origin = sanitizeString(getHeaderValue(event, "origin"), 240);
  if (origin) return origin;
  const referer = sanitizeString(getHeaderValue(event, "referer"), 900);
  if (!referer) return "";
  try {
    return sanitizeString(new URL(referer).origin, 240);
  } catch {
    return "";
  }
};

const getTables = () => ({
  sessions: sanitizeId(getEnv("SUPABASE_CHAT_SESSIONS_TABLE") || "chat_sessions", 120) || "chat_sessions",
  messages: sanitizeId(getEnv("SUPABASE_CHAT_MESSAGES_TABLE") || "chat_messages", 120) || "chat_messages",
  feedback: sanitizeId(getEnv("SUPABASE_CHAT_FEEDBACK_TABLE") || "chat_feedback", 120) || "chat_feedback",
});

const isLearningEnabled = () => parseBoolean(getEnv("SUPABASE_CHAT_LEARNING_ENABLED"), true);

const upsertSession = async ({ tables, sessionId, pageContext, event }) => {
  const nowIso = new Date().toISOString();
  const sourceOrigin = getSourceOrigin(event);
  const userAgent = sanitizeString(getHeaderValue(event, "user-agent"), 300);

  await supabaseRestRequest(`${tables.sessions}?on_conflict=session_id`, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        page_type: pageContext.pageType || null,
        city: pageContext.city || null,
        listing_id: pageContext.listingId || null,
        pathname: pageContext.pathname || null,
        source_origin: sourceOrigin || null,
        user_agent: userAgent || null,
        last_seen_at: nowIso,
      },
    ],
    prefer: "resolution=merge-duplicates,return=minimal",
  });
};

const storeTurn = async ({
  tables,
  sessionId,
  pageContext,
  userMessage,
  assistantMessage,
  responseMode,
  responseModel,
}) => {
  const messages = [userMessage, assistantMessage].filter(Boolean);
  if (!messages.length) return;

  const now = Date.now();
  const rows = messages.map((message, index) => ({
    session_id: sessionId,
    message_id: message.id || `${message.role}-${Date.now()}-${index}`,
    role: message.role,
    content: message.content,
    cards: message.cards?.length ? message.cards : null,
    metadata: {
      pageType: pageContext.pageType || null,
      city: pageContext.city || null,
      listingId: pageContext.listingId || null,
      responseMode: responseMode || null,
      responseModel: responseModel || null,
      quickReplies: message.quickReplies?.length ? message.quickReplies : null,
      senderType:
        message.senderType || (message.role === "user" ? "guest" : "assistant"),
      senderName: message.senderName || null,
      senderEmail: message.senderEmail || null,
    },
    created_at: new Date(now + index).toISOString(),
  }));

  await supabaseRestRequest(`${tables.messages}?on_conflict=session_id,message_id`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
};

const sanitizeSyncedMessageRow = (row = {}) => ({
  id: sanitizeId(row?.message_id, 120),
  role: sanitizeString(row?.role, 20) === "user" ? "user" : "assistant",
  content: sanitizeString(row?.content, 3000),
  cards: sanitizeCards(row?.cards),
  quickReplies: sanitizeQuickReplies(row?.metadata?.quickReplies),
  senderType: sanitizeString(row?.metadata?.senderType, 40).toLowerCase() || "assistant",
  senderName: sanitizeString(row?.metadata?.senderName, 160),
  senderEmail: sanitizeString(row?.metadata?.senderEmail, 160),
  createdAt: sanitizeString(row?.created_at, 80),
});

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const fetchSessionMessages = async ({ tables, sessionId, limit = 24 }) => {
  const rows = await supabaseRestRequest(tables.messages, {
    query: {
      select: "session_id,message_id,role,content,cards,metadata,created_at",
      session_id: `eq.${sessionId}`,
      order: "created_at.asc",
      limit: String(Math.max(1, Math.min(50, Number(limit) || 24))),
    },
    timeout: 12_000,
  });

  if (!Array.isArray(rows)) return [];

  const sortedRows = [...rows].sort((left, right) => {
    const leftTime = toTimestamp(left?.created_at);
    const rightTime = toTimestamp(right?.created_at);
    if (leftTime !== rightTime) return leftTime - rightTime;

    const leftRole = sanitizeString(left?.role, 20) === "user" ? 0 : 1;
    const rightRole = sanitizeString(right?.role, 20) === "user" ? 0 : 1;
    if (leftRole !== rightRole) return leftRole - rightRole;

    const leftId = sanitizeId(left?.message_id, 120);
    const rightId = sanitizeId(right?.message_id, 120);
    return leftId.localeCompare(rightId);
  });

  return sortedRows.map(sanitizeSyncedMessageRow).filter((row) => row.id && row.content);
};

const storeFeedback = async ({
  tables,
  sessionId,
  pageContext,
  assistantMessageId,
  rating,
  assistantContent,
  relatedUserContent,
}) => {
  const nowIso = new Date().toISOString();
  await supabaseRestRequest(`${tables.feedback}?on_conflict=session_id,message_id`, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        message_id: assistantMessageId,
        rating,
        assistant_message: sanitizeString(assistantContent, 3000) || null,
        user_message: sanitizeString(relatedUserContent, 3000) || null,
        page_context: pageContext,
        updated_at: nowIso,
      },
    ],
    prefer: "resolution=merge-duplicates,return=minimal",
  });
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: getCorsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  const protection = verifyAiRequest(event, { endpoint: "chat_learning" });
  if (!protection.ok) {
    return jsonResponse(
      protection.status || 403,
      { error: protection.error || "Request blocked" },
      event,
      protection.retryAfter ? { "Retry-After": String(protection.retryAfter) } : {},
    );
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, event);
  }

  if (!isLearningEnabled()) {
    return jsonResponse(200, { ok: true, disabled: true }, event);
  }

  const action = sanitizeString(payload?.action, 40).toLowerCase();
  const sessionId = sanitizeId(payload?.chatSessionId, 80);
  if (!sessionId) {
    return jsonResponse(400, { error: "chatSessionId is required" }, event);
  }

  const pageContext = sanitizePageContext(payload?.pageContext || {});
  const tables = getTables();

  try {
    if (action === "turn") {
      await upsertSession({ tables, sessionId, pageContext, event });
      const userMessage = sanitizeMessagePayload(payload?.userMessage, "user");
      const assistantMessage = sanitizeMessagePayload(payload?.assistantMessage, "assistant");
      if (!assistantMessage && !userMessage) {
        return jsonResponse(400, { error: "At least one message is required for turn logging" }, event);
      }

      await storeTurn({
        tables,
        sessionId,
        pageContext,
        userMessage,
        assistantMessage,
        responseMode: sanitizeString(payload?.responseMode, 40),
        responseModel: sanitizeString(payload?.responseModel, 120),
      });

      return jsonResponse(200, { ok: true }, event);
    }

    if (action === "feedback") {
      await upsertSession({ tables, sessionId, pageContext, event });
      const assistantMessageId = sanitizeId(payload?.assistantMessageId, 120);
      const rating = normalizeRating(payload?.rating);
      if (!assistantMessageId || !rating) {
        return jsonResponse(400, { error: "assistantMessageId and rating(good|bad) are required" }, event);
      }

      await storeFeedback({
        tables,
        sessionId,
        pageContext,
        assistantMessageId,
        rating,
        assistantContent: payload?.assistantContent,
        relatedUserContent: payload?.relatedUserContent,
      });

      return jsonResponse(200, { ok: true }, event);
    }

    if (action === "sync") {
      return jsonResponse(
        200,
        {
          ok: true,
          messages: await fetchSessionMessages({ tables, sessionId, limit: payload?.limit || 24 }),
        },
        event,
      );
    }

    return jsonResponse(400, { error: "Unsupported action" }, event);
  } catch (error) {
    console.warn("chat-learning storage failed", {
      message: error?.message || String(error),
    });
    return jsonResponse(
      200,
      {
        ok: false,
        error: "Chat learning storage is unavailable right now.",
      },
      event,
    );
  }
}
