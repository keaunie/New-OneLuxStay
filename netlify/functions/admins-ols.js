import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import {
  getAdminsOlsActivityTable,
  logAdminsOlsActivity,
  sanitizeAdminsOlsActivityRow,
} from "./_shared/adminsOlsActivity.js";
import { fetchWithTimeout } from "./_shared/http.js";
import {
  buildSupabaseRestUrl,
  getSupabaseConfig,
  supabaseRestRequest,
} from "./_shared/supabaseClient.js";
import {
  updateAdminsOlsUserAccount,
  verifyAdminsOlsAccess,
  verifyAdminsOlsPassword,
} from "./_shared/adminsOlsAuth.js";

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
  const recentGuestJourneyEvents = Array.isArray(recentGuestCityClicksRaw)
    ? recentGuestCityClicksRaw.map(sanitizeGuestJourneyRow)
    : [];
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
      topGuestCities: sortAndCountValues(recentGuestJourneyEvents, (row) => row.city || "Unknown"),
      topGuestPages: sortAndCountValues(recentGuestJourneyEvents, (row) => row.pathname || row.destinationPath || "Unknown"),
      topGuestEventTypes: sortAndCountValues(recentGuestJourneyEvents, (row) => row.eventType || "Unknown"),
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
        },
        event,
      );
    }

    if (action === "get_guest_journey_events") {
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
