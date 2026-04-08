import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { fetchWithTimeout } from "./_shared/http.js";
import {
  buildSupabaseRestUrl,
  getSupabaseConfig,
  supabaseRestRequest,
} from "./_shared/supabaseClient.js";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";

dotenv.config();

const DEFAULT_SENTIMENT_TABLE = "chat_sentiment_lessons";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const parseBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const normalizeSentimentLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["positive", "neutral", "negative"].includes(normalized)) return normalized;
  return "";
};

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
  sentiment:
    sanitizeId(getEnv("SUPABASE_CHAT_SENTIMENT_TABLE") || DEFAULT_SENTIMENT_TABLE, 120) ||
    DEFAULT_SENTIMENT_TABLE,
});

const getServiceHeaders = () => {
  const { serviceRoleKey } = getSupabaseConfig({ requireServiceRole: true });
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
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
  createdAt: sanitizeString(row?.created_at, 80),
  updatedAt: sanitizeString(row?.updated_at, 80),
});

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

const getDashboardData = async (tables) => {
  const [
    sessionsTotal,
    messagesTotal,
    feedbackTotal,
    goodFeedbackTotal,
    badFeedbackTotal,
    lessonsTotal,
    activeLessonsTotal,
    recentSessionsRaw,
    recentFeedbackRaw,
    recentAssistantMessagesRaw,
    recentConversationMessagesRaw,
    sentimentLessonsRaw,
  ] = await Promise.all([
    countRows(tables.sessions, { select: "session_id" }),
    countRows(tables.messages, { select: "id" }),
    countRows(tables.feedback, { select: "id" }),
    countRows(tables.feedback, { select: "id", query: { rating: "eq.good" } }),
    countRows(tables.feedback, { select: "id", query: { rating: "eq.bad" } }),
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
    supabaseRestRequest(tables.sentiment, {
      query: {
        select: "id,title,sentiment_label,trigger_text,response_guidance,example_user_message,example_assistant_style,admin_notes,active,created_at,updated_at",
        order: "updated_at.desc",
        limit: "40",
      },
      timeout: 12_000,
    }),
  ]);

  const recentSessions = Array.isArray(recentSessionsRaw) ? recentSessionsRaw.map(sanitizeSessionRow) : [];
  const recentFeedback = Array.isArray(recentFeedbackRaw) ? recentFeedbackRaw.map(sanitizeFeedbackRow) : [];
  const recentAssistantMessages = Array.isArray(recentAssistantMessagesRaw)
    ? recentAssistantMessagesRaw.map(sanitizeAssistantMessageRow)
    : [];
  const recentConversationMessages = Array.isArray(recentConversationMessagesRaw)
    ? recentConversationMessagesRaw.map(sanitizeConversationMessageRow)
    : [];
  const sentimentLessons = Array.isArray(sentimentLessonsRaw) ? sentimentLessonsRaw.map(sanitizeLessonRow) : [];
  const recentConversations = buildRecentConversationThreads({
    conversationMessages: recentConversationMessages,
    recentSessions,
    maxThreads: 8,
    maxMessagesPerThread: 12,
  });

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      sessionsTotal,
      messagesTotal,
      feedbackTotal,
      goodFeedbackTotal,
      badFeedbackTotal,
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
      deployContext: sanitizeString(process.env.CONTEXT || process.env.NODE_ENV || "unknown", 120),
      siteUrl: sanitizeString(process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "", 240),
      tables,
    },
    rollups: {
      topCities: sortAndCountValues(recentSessions, (row) => row.city || "Unknown"),
      topPageTypes: sortAndCountValues(recentSessions, (row) => row.pageType || "Unknown"),
      lessonsBySentiment: sortAndCountValues(sentimentLessons, (row) => row.sentimentLabel || "Unknown"),
    },
    recentSessions,
    recentFeedback,
    recentAssistantMessages,
    recentConversations,
    sentimentLessons,
  };
};

const createLesson = async (payload, tables) => {
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

  const rows = await supabaseRestRequest(tables.sentiment, {
    method: "POST",
    body: [
      {
        title,
        sentiment_label: sentimentLabel,
        trigger_text: triggerText || null,
        response_guidance: responseGuidance,
        example_user_message: exampleUserMessage || null,
        example_assistant_style: exampleAssistantStyle || null,
        admin_notes: adminNotes || null,
        active,
        updated_at: new Date().toISOString(),
      },
    ],
    prefer: "return=representation",
    timeout: 12_000,
  });

  return sanitizeLessonRow(Array.isArray(rows) ? rows[0] : {});
};

const updateLessonActive = async (payload, tables) => {
  const lessonId = sanitizeId(payload?.lessonId, 120);
  if (!lessonId) throw new Error("lessonId is required.");

  const rows = await supabaseRestRequest(`${tables.sentiment}?id=eq.${encodeURIComponent(lessonId)}`, {
    method: "PATCH",
    body: {
      active: Boolean(payload?.active),
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
    timeout: 12_000,
  });

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
        { ok: true, currentAdmin: adminAccess.user, ...(await getDashboardData(tables)) },
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
      return jsonResponse(200, { ok: true, lesson: await createLesson(payload, tables) }, event);
    }

    if (action === "set_lesson_active") {
      return jsonResponse(200, { ok: true, lesson: await updateLessonActive(payload, tables) }, event);
    }

    if (action === "delete_lesson") {
      return jsonResponse(200, { ok: true, ...(await deleteLesson(payload, tables)) }, event);
    }

    if (action === "send_reply") {
      return jsonResponse(
        200,
        { ok: true, message: await createAdminReply(payload, tables, adminAccess.user) },
        event,
      );
    }

    return jsonResponse(400, { error: "Unsupported action" }, event);
  } catch (error) {
    return jsonResponse(
      500,
      { error: sanitizeString(error?.message || "Admin request failed", 500) },
      event,
    );
  }
}
