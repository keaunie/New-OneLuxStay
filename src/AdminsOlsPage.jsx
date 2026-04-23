import { Link, Navigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import apiBase from "./utils/apiBase";
import {
  clearAdminsOlsSession,
  getAdminsOlsAuthHeaders,
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
  saveAdminsOlsSession,
} from "./utils/adminsOlsAuth";
import "./AdminsOlsPage.css";

const DASHBOARD_ACTIVITY_DEDUPE_KEY = "admins-ols-dashboard-opened";
const DASHBOARD_ACTIVITY_DEDUPE_WINDOW_MS = 5000;
const TAB_TRANSITION_MS = 180;
const ATTENTION_STORAGE_KEY_PREFIX = "admins-ols-attention-seen";
const ATTENTION_NOTIFIED_KEY_PREFIX = "admins-ols-attention-notified";
const TOAST_LIFETIME_MS = 5200;
const CONVERSATION_SUMMARY_SEEN_KEY_PREFIX = "admins-ols-conversation-summary-seen";
const CONVERSATION_SUMMARY_CACHE_PREFIX = "admins-ols-conversation-summary-cache";

const DEFAULT_FORM = {
  title: "",
  sentimentLabel: "negative",
  triggerText: "",
  responseGuidance: "",
  exampleUserMessage: "",
  exampleAssistantStyle: "",
  adminNotes: "",
  active: true,
};

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const truncate = (value = "", maxLength = 180) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const sentimentToneLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "positive") return "Positive";
  if (normalized === "neutral") return "Neutral";
  if (normalized === "negative") return "Negative";
  return "Unknown";
};

const titleCase = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatPageLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Website";
  if (normalized === "home") return "Homepage";
  if (normalized === "listing") return "Listing Page";
  if (normalized === "global") return "Global Listings";
  if (normalized === "whatsapp") return "WhatsApp";
  return titleCase(normalized);
};

const formatGuestClickSourceLabel = (item = {}) => {
  const sourceSection = String(item?.sourceSection || "").trim();
  const sourceLabel = String(item?.sourceLabel || "").trim();
  const parts = [];
  if (sourceSection) parts.push(titleCase(sourceSection));
  if (sourceLabel) parts.push(titleCase(sourceLabel));
  return parts.join(" / ") || "City click";
};

const parseAdminConversationSummary = (text = "") => {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const out = { tldr: "", want: "", next: "", missing: [] };
  let section = "";

  const pushLine = (target, value) => {
    const cleaned = String(value || "")
      .replace(/^[-*]\s+/, "")
      .trim();
    if (!cleaned) return;

    if (target === "missing") {
      if (!/^none$/i.test(cleaned) && out.missing.length < 6) out.missing.push(cleaned);
      return;
    }

    if (!out[target]) out[target] = cleaned;
    else if (out[target].length < 220) out[target] = `${out[target]} ${cleaned}`.trim();
  };

  lines.forEach((line) => {
    const lower = line.toLowerCase();

    if (lower.startsWith("tl;dr")) {
      section = "tldr";
      const inline = line.includes(":") ? line.split(":").slice(1).join(":").trim() : "";
      if (inline) pushLine("tldr", inline);
      return;
    }
    if (lower.startsWith("what the guest wants")) {
      section = "want";
      return;
    }
    if (lower.startsWith("what to do next")) {
      section = "next";
      return;
    }
    if (lower.startsWith("missing info")) {
      section = "missing";
      return;
    }

    if (!section) return;
    pushLine(section, line);
  });

  if (!out.tldr) {
    const first = lines.find((line) => !/^(what|missing|tl;dr)/i.test(line)) || "";
    out.tldr = first.replace(/^[-*]\s+/, "").trim();
  }

  // Tiny cleanups to keep the card compact.
  out.want = out.want.replace(/\s+/g, " ").trim();
  out.next = out.next.replace(/\s+/g, " ").trim();
  out.tldr = out.tldr.replace(/\s+/g, " ").trim();

  return out;
};

const formatGuestJourneyEventLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "page_view") return "Page View";
  if (normalized === "listing_click") return "Listing Click";
  if (normalized === "city_click") return "City Click";
  if (normalized === "search_submit") return "Search Submit";
  return titleCase(normalized) || "Guest Event";
};

const shortenId = (value = "", start = 6, end = 4) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
};

const getAdminInitials = (admin = {}) => {
  const fullName = String(admin?.fullName || "").trim();
  if (fullName) {
    const words = fullName.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  const email = String(admin?.email || "").trim();
  if (!email) return "AD";
  return email.slice(0, 2).toUpperCase();
};

const getConversationLatestUserMessage = (thread = {}) =>
  [...(Array.isArray(thread?.messages) ? thread.messages : [])]
    .reverse()
    .find((message) => message?.role === "user" && String(message?.content || "").trim());

const getConversationLatestMessage = (thread = {}) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  return messages[messages.length - 1] || null;
};

const isWhatsAppConversation = (thread = {}) =>
  String(thread?.pageType || "").trim().toLowerCase() === "whatsapp" ||
  String(thread?.sessionId || "").trim().toLowerCase().startsWith("whatsapp:");

const getWhatsAppPhoneLabel = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  if (!sessionId.toLowerCase().startsWith("whatsapp:")) return "";
  const digits = sessionId.slice("whatsapp:".length).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `+${digits}`;
};

const getConversationTitle = (thread = {}) => {
  if (isWhatsAppConversation(thread)) {
    return `WhatsApp ${getWhatsAppPhoneLabel(thread) || "guest"}`;
  }

  const city = String(thread?.city || "").trim();
  if (city && city.toLowerCase() !== "unknown city") return city;

  const latestUserMessage = getConversationLatestUserMessage(thread);
  if (latestUserMessage?.content) return truncate(latestUserMessage.content, 40);

  return "Guest conversation";
};

const getConversationPreview = (thread = {}) => {
  const latestUserMessage = getConversationLatestUserMessage(thread);
  if (latestUserMessage?.content) return truncate(latestUserMessage.content, 120);

  const latestMessage = getConversationLatestMessage(thread);
  if (latestMessage?.content) return truncate(latestMessage.content, 120);

  return truncate(thread?.pathname || "No message content captured yet.", 120);
};

const getConversationInitial = (thread = {}) => {
  const title = getConversationTitle(thread);
  const clean = String(title || "").trim();
  return clean ? clean.charAt(0).toUpperCase() : "C";
};

const conversationNeedsAttention = (thread = {}) =>
  (Array.isArray(thread?.messages) ? thread.messages : []).some(
    (message) => String(message?.metadata?.responseMode || "").trim().toLowerCase() === "needs_attention",
  );

const getConversationAttentionSignature = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  const lastSeenAt = String(thread?.lastSeenAt || "").trim();
  const messageCount = Number(thread?.messageCount || 0);
  if (!sessionId) return "";
  return `${sessionId}:${lastSeenAt}:${messageCount}`;
};

const loadStoredStringList = (key = "") => {
  if (!key || typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const saveStoredStringList = (key = "", values = []) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
  } catch {
    // Ignore storage errors so alerts still work for the active session.
  }
};

const loadSessionStringList = (key = "") => {
  if (!key || typeof window === "undefined" || !window.sessionStorage) return [];
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const saveSessionStringList = (key = "", values = []) => {
  if (!key || typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
  } catch {
    // ignore
  }
};

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getConversationMessageSenderType = (message = {}) => {
  if (message?.role === "user") return "guest";
  const senderType = String(message?.metadata?.senderType || "").trim().toLowerCase();
  if (senderType === "admin") return "admin";
  return "assistant";
};

const getConversationMessageLabel = (message = {}) => {
  const senderType = getConversationMessageSenderType(message);
  if (senderType === "guest") return "Guest";
  if (senderType === "admin") return message?.metadata?.senderName || "Admin";
  return "Assistant";
};

const getConversationMessageBubbleClass = (message = {}) => {
  if (message?.role === "user") return "is-user";
  return getConversationMessageSenderType(message) === "admin" ? "is-admin" : "is-assistant";
};

const getAssistantTurnSourceLabel = (item = {}) => {
  const metadata = item?.metadata || {};
  const senderType = String(metadata.senderType || "").trim().toLowerCase();
  const responseMode = String(metadata.responseMode || "").trim().toLowerCase();

  if (senderType === "admin" || responseMode === "admin_reply") {
    return metadata.senderName || metadata.senderEmail || "Admin";
  }

  return "AI-Agent";
};

const formatAdminActivityEventLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Activity";
  if (normalized === "sign_in") return "Signed In";
  if (normalized === "sign_out") return "Signed Out";
  if (normalized === "sign_up") return "Admin Created";
  if (normalized === "session_refresh") return "Session Refreshed";
  if (normalized === "dashboard_opened") return "Dashboard Opened";
  if (normalized === "manual_refresh") return "Manual Refresh";
  if (normalized === "conversation_reply") return "Admin Reply";
  if (normalized === "guest_attention_needed") return "Guest Needs Attention";
  if (normalized === "lesson_created") return "Lesson Created";
  if (normalized === "lesson_activated") return "Lesson Activated";
  if (normalized === "lesson_deactivated") return "Lesson Deactivated";
  if (normalized === "lesson_deleted") return "Lesson Deleted";
  if (normalized === "profile_updated") return "Profile Updated";
  if (normalized === "password_updated") return "Password Updated";
  if (normalized === "account_updated") return "Account Updated";
  return titleCase(normalized);
};

const getAdminActivityTone = (item = {}) => {
  const normalized = String(item?.eventType || "").trim().toLowerCase();
  if (["sign_in", "sign_up", "dashboard_opened", "conversation_reply", "lesson_created", "lesson_activated"].includes(normalized)) {
    return "positive";
  }
  if (["lesson_deleted", "lesson_deactivated", "guest_attention_needed"].includes(normalized)) return "negative";
  return "neutral";
};

const getAdminActivityActorLabel = (item = {}) =>
  item?.actorName || item?.actorEmail || "Admin";

const getAdminActivityMetaLine = (item = {}) => {
  const details = item?.details || {};
  const parts = [];

  if (details.city) parts.push(details.city);
  if (details.pageType) parts.push(formatPageLabel(details.pageType));
  if (details.lessonTitle) parts.push(details.lessonTitle);
  if (details.sessionId) parts.push(`Session ${shortenId(details.sessionId, 4, 4)}`);

  return parts.join(" | ");
};

const getLessonActorLabel = (actor = {}) =>
  actor?.name || actor?.email || "";

const injectMessageIntoDashboard = (dashboard, threadMeta = {}, message = {}) => {
  if (!dashboard || !message?.messageId || !threadMeta?.sessionId) return dashboard;

  const fallbackThread = {
    sessionId: threadMeta.sessionId,
    city: threadMeta.city || "",
    pageType: threadMeta.pageType || "",
    listingId: threadMeta.listingId || "",
    pathname: threadMeta.pathname || "",
    lastSeenAt: message.createdAt || threadMeta.lastSeenAt || "",
    messageCount: 0,
    messages: [],
  };

  const existingThreads = Array.isArray(dashboard.recentConversations)
    ? dashboard.recentConversations
    : [];
  const nextThreads = existingThreads.map((thread) => {
    if (thread.sessionId !== threadMeta.sessionId) return thread;

    const existingMessages = Array.isArray(thread.messages) ? thread.messages : [];
    const filteredMessages = existingMessages.filter((item) => item.messageId !== message.messageId);
    const nextMessages = [...filteredMessages, message].sort(
      (left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt),
    );

    return {
      ...thread,
      city: thread.city || threadMeta.city || "",
      pageType: thread.pageType || threadMeta.pageType || "",
      listingId: thread.listingId || threadMeta.listingId || "",
      pathname: thread.pathname || threadMeta.pathname || "",
      lastSeenAt: message.createdAt || thread.lastSeenAt || threadMeta.lastSeenAt || "",
      messageCount: nextMessages.length,
      messages: nextMessages,
    };
  });

  const hasThread = nextThreads.some((thread) => thread.sessionId === threadMeta.sessionId);
  const mergedThreads = hasThread
    ? nextThreads
    : [
        {
          ...fallbackThread,
          lastSeenAt: message.createdAt || fallbackThread.lastSeenAt,
          messageCount: 1,
          messages: [message],
        },
        ...nextThreads,
      ];

  return {
    ...dashboard,
    overview: {
      ...(dashboard.overview || {}),
      messagesTotal: Number(dashboard?.overview?.messagesTotal || 0) + 1,
    },
    recentConversations: mergedThreads
      .sort((left, right) => toTimestamp(right.lastSeenAt) - toTimestamp(left.lastSeenAt))
      .slice(0, 12),
  };
};

const shouldLogDashboardOpen = () => {
  if (typeof window === "undefined" || !window.sessionStorage) return true;

  try {
    const previous = Number(window.sessionStorage.getItem(DASHBOARD_ACTIVITY_DEDUPE_KEY) || 0);
    const now = Date.now();
    if (Number.isFinite(previous) && previous > 0 && now - previous < DASHBOARD_ACTIVITY_DEDUPE_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(DASHBOARD_ACTIVITY_DEDUPE_KEY, String(now));
    return true;
  } catch {
    return true;
  }
};

function AdminsOlsPage() {
  const [session, setSession] = useState(() => loadAdminsOlsSession());
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lessonForm, setLessonForm] = useState(() => ({ ...DEFAULT_FORM }));
  const [savingLesson, setSavingLesson] = useState(false);
  const [busyLessonId, setBusyLessonId] = useState("");
  const [selectedConversationSessionId, setSelectedConversationSessionId] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [conversationSummary, setConversationSummary] = useState(null);
  const [conversationSummaryLoading, setConversationSummaryLoading] = useState(false);
  const [conversationSummaryError, setConversationSummaryError] = useState("");
  const [isConversationSummaryModalOpen, setIsConversationSummaryModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(() => ({
    fullName: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  }));
  const [savingAccount, setSavingAccount] = useState(false);
  const [inviteForm, setInviteForm] = useState(() => ({
    email: "",
    fullName: "",
    role: "admins_ols",
    forceResend: false,
  }));
  const [sendingInvite, setSendingInvite] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [toasts, setToasts] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarDesktopPhase, setSidebarDesktopPhase] = useState("idle");
  const [activeTabId, setActiveTabId] = useState("overview");
  const [displayedTabId, setDisplayedTabId] = useState("overview");
  const [tabContentPhase, setTabContentPhase] = useState("idle");
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported",
  );
  const [attentionSeenSignatures, setAttentionSeenSignatures] = useState([]);
  const threadScrollRef = useRef(null);
  const hasLoggedDashboardOpenRef = useRef(false);
  const conversationSummaryAbortRef = useRef(null);
  const sidebarPhaseTimeoutRef = useRef(null);
  const tabTransitionTimeoutRef = useRef(null);
  const attentionHydratedRef = useRef(false);
  const audioContextRef = useRef(null);
  const audioPrimedRef = useRef(false);
  const toastTimersRef = useRef(new Map());
  const conversationSummaryCloseButtonRef = useRef(null);
  const lastActiveElementRef = useRef(null);

  const overview = dashboard?.overview || {};
  const system = dashboard?.system || {};
  const rollups = dashboard?.rollups || {};
  const currentAdmin = dashboard?.currentAdmin || session?.user || {};
  const isSharedKeySession = Boolean(session?.sharedKey && !session?.accessToken);
  const isSuperAdmin = currentAdmin?.isSuperAdmin === true;
  const recentSessions = Array.isArray(dashboard?.recentSessions) ? dashboard.recentSessions : [];
  const recentFeedback = Array.isArray(dashboard?.recentFeedback) ? dashboard.recentFeedback : [];
  const recentAssistantMessages = Array.isArray(dashboard?.recentAssistantMessages)
    ? dashboard.recentAssistantMessages
    : [];
  const recentConversations = Array.isArray(dashboard?.recentConversations)
    ? dashboard.recentConversations
    : [];
  const recentGuestJourneyEvents = Array.isArray(dashboard?.recentGuestJourneyEvents)
    ? dashboard.recentGuestJourneyEvents
    : [];
  const recentAdminActivity = Array.isArray(dashboard?.recentAdminActivity)
    ? dashboard.recentAdminActivity
    : [];
  const sentimentLessons = Array.isArray(dashboard?.sentimentLessons) ? dashboard.sentimentLessons : [];
  const attentionThreads = recentConversations.filter(conversationNeedsAttention);
  const unreadAttentionThreads = attentionThreads.filter(
    (thread) => !attentionSeenSignatures.includes(getConversationAttentionSignature(thread)),
  );
  const unreadAttentionCount = unreadAttentionThreads.length;
  const selectedConversation =
    recentConversations.find((thread) => thread.sessionId === selectedConversationSessionId) ||
    recentConversations[0] ||
    null;

  const conversationSummarySeenStorageKey = useMemo(() => {
    const identity = String(currentAdmin?.email || currentAdmin?.id || "shared").trim().toLowerCase();
    return `${CONVERSATION_SUMMARY_SEEN_KEY_PREFIX}:${identity || "shared"}`;
  }, [currentAdmin?.email, currentAdmin?.id]);

  const conversationSummaryCacheKey = useMemo(() => {
    const identity = String(currentAdmin?.email || currentAdmin?.id || "shared").trim().toLowerCase();
    return `${CONVERSATION_SUMMARY_CACHE_PREFIX}:${identity || "shared"}`;
  }, [currentAdmin?.email, currentAdmin?.id]);

  const loadCachedConversationSummary = (sessionId) => {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(`${conversationSummaryCacheKey}:${sessionId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const text = String(parsed?.text || "").trim();
      if (!text) return null;
      if (/^unable to generate summary\.?/i.test(text)) return null;
      return {
        sessionId,
        text,
        generatedAt: String(parsed?.generatedAt || ""),
        model: String(parsed?.model || ""),
      };
    } catch {
      return null;
    }
  };

  const cachedSelectedConversationSummary = useMemo(() => {
    if (!selectedConversation?.sessionId) return null;
    return loadCachedConversationSummary(selectedConversation.sessionId);
  }, [selectedConversation?.sessionId, conversationSummaryCacheKey]);

  const saveCachedConversationSummary = (summary) => {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    try {
      if (!summary?.sessionId) return;
      if (/^unable to generate summary\.?/i.test(String(summary.text || "").trim())) return;
      window.sessionStorage.setItem(
        `${conversationSummaryCacheKey}:${summary.sessionId}`,
        JSON.stringify({
          text: String(summary.text || ""),
          generatedAt: String(summary.generatedAt || ""),
          model: String(summary.model || ""),
        }),
      );
    } catch {
      // ignore cache failures
    }
  };

  const feedbackHealth = useMemo(() => {
    const good = Number(overview.goodFeedbackTotal || 0);
    const bad = Number(overview.badFeedbackTotal || 0);
    const total = good + bad;
    return {
      total,
      goodRate: total ? Math.round((good / total) * 100) : 0,
      badRate: total ? Math.round((bad / total) * 100) : 0,
    };
  }, [overview.badFeedbackTotal, overview.goodFeedbackTotal]);

  const attentionSeenStorageKey = useMemo(() => {
    const identity = String(currentAdmin?.email || currentAdmin?.id || "shared").trim().toLowerCase();
    return `${ATTENTION_STORAGE_KEY_PREFIX}:${identity || "shared"}`;
  }, [currentAdmin?.email, currentAdmin?.id]);

  const attentionNotifiedStorageKey = useMemo(() => {
    const identity = String(currentAdmin?.email || currentAdmin?.id || "shared").trim().toLowerCase();
    return `${ATTENTION_NOTIFIED_KEY_PREFIX}:${identity || "shared"}`;
  }, [currentAdmin?.email, currentAdmin?.id]);

  useEffect(() => {
    const previousTitle = document.title;

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.adminsOls = "true";
    document.head.appendChild(robotsMeta);

    return () => {
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, []);

  useEffect(() => () => {
    if (sidebarPhaseTimeoutRef.current) {
      window.clearTimeout(sidebarPhaseTimeoutRef.current);
      sidebarPhaseTimeoutRef.current = null;
    }
    if (tabTransitionTimeoutRef.current) {
      window.clearTimeout(tabTransitionTimeoutRef.current);
      tabTransitionTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      const timers = toastTimersRef.current;
      timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timers.clear();
    },
    [],
  );

  const removeToast = (id) => {
    const key = String(id || "");
    if (!key) return;
    const timers = toastTimersRef.current;
    if (timers.has(key)) {
      window.clearTimeout(timers.get(key));
      timers.delete(key);
    }
    setToasts((current) => current.filter((item) => item.id !== key));
  };

  const pushToast = ({ tone = "neutral", title = "", message = "" } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = {
      id,
      tone: ["positive", "negative", "warning"].includes(tone) ? tone : "neutral",
      title: String(title || "").trim(),
      message: String(message || "").trim(),
      createdAt: Date.now(),
    };

    setToasts((current) => [toast, ...current].slice(0, 4));
    const timeoutId = window.setTimeout(() => removeToast(id), TOAST_LIFETIME_MS);
    toastTimersRef.current.set(id, timeoutId);
  };

  useEffect(() => {
    if (activeTabId === displayedTabId) return undefined;

    if (tabTransitionTimeoutRef.current) {
      window.clearTimeout(tabTransitionTimeoutRef.current);
      tabTransitionTimeoutRef.current = null;
    }

    setTabContentPhase("is-exiting");
    tabTransitionTimeoutRef.current = window.setTimeout(() => {
      setDisplayedTabId(activeTabId);
      setTabContentPhase("is-entering");
      tabTransitionTimeoutRef.current = window.setTimeout(() => {
        setTabContentPhase("idle");
        tabTransitionTimeoutRef.current = null;
      }, TAB_TRANSITION_MS + 80);
    }, TAB_TRANSITION_MS);

    return () => {
      if (tabTransitionTimeoutRef.current) {
        window.clearTimeout(tabTransitionTimeoutRef.current);
        tabTransitionTimeoutRef.current = null;
      }
    };
  }, [activeTabId, displayedTabId]);

  useEffect(() => {
    let active = true;

    const ensureFreshSession = async () => {
      if (!session?.accessToken) return;
      if (!isAdminsOlsSessionExpired(session)) return;

      const refreshed = await refreshAdminsOlsSession(apiBase, session).catch(() => null);
      if (!active) return;
      if (refreshed?.accessToken) {
        setSession(refreshed);
        return;
      }

      clearAdminsOlsSession();
      setSession(null);
    };

    ensureFreshSession();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!recentConversations.length) {
      setSelectedConversationSessionId("");
      return;
    }

    const hasSelectedConversation = recentConversations.some(
      (thread) => thread.sessionId === selectedConversationSessionId,
    );
    if (!selectedConversationSessionId || !hasSelectedConversation) {
      setSelectedConversationSessionId(recentConversations[0].sessionId);
    }
  }, [recentConversations, selectedConversationSessionId]);

  useEffect(() => {
    if (!threadScrollRef.current) return;
    threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
  }, [selectedConversation?.sessionId, selectedConversation?.messageCount]);

  useEffect(() => {
    setReplyDraft("");
  }, [selectedConversation?.sessionId]);

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      fullName: currentAdmin?.fullName || "",
    }));
  }, [currentAdmin?.fullName]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    setInviteForm((current) => ({
      ...current,
      fullName: current.fullName || currentAdmin?.fullName || "",
    }));
  }, [currentAdmin?.fullName, isSuperAdmin]);

  useEffect(() => {
    attentionHydratedRef.current = false;
    const storedSeen = loadStoredStringList(attentionSeenStorageKey);
    setAttentionSeenSignatures(storedSeen);
  }, [attentionSeenStorageKey]);

  useEffect(() => {
    saveStoredStringList(attentionSeenStorageKey, attentionSeenSignatures);
  }, [attentionSeenSignatures, attentionSeenStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updatePermission = () => {
      setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
    };

    updatePermission();
    window.addEventListener("focus", updatePermission);
    return () => window.removeEventListener("focus", updatePermission);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const primeAudio = async () => {
      if (audioPrimedRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }
        audioPrimedRef.current = true;
      } catch {
        // Ignore autoplay restrictions until the next interaction.
      }
    };

    window.addEventListener("pointerdown", primeAudio, { passive: true });
    window.addEventListener("keydown", primeAudio);

    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);

  useEffect(() => {
    if (!attentionThreads.length) {
      attentionHydratedRef.current = true;
      return;
    }

    const currentSignatures = attentionThreads
      .map((thread) => getConversationAttentionSignature(thread))
      .filter(Boolean);

    if (!attentionHydratedRef.current) {
      const notified = loadStoredStringList(attentionNotifiedStorageKey);
      saveStoredStringList(attentionNotifiedStorageKey, [...notified, ...currentSignatures]);
      attentionHydratedRef.current = true;
      return;
    }

    const notified = new Set(loadStoredStringList(attentionNotifiedStorageKey));
    const newSignatures = currentSignatures.filter((signature) => !notified.has(signature));
    if (!newSignatures.length) return;

    saveStoredStringList(attentionNotifiedStorageKey, [...notified, ...newSignatures]);

    const newestThread = attentionThreads
      .filter((thread) => newSignatures.includes(getConversationAttentionSignature(thread)))
      .sort((left, right) => toTimestamp(right.lastSeenAt) - toTimestamp(left.lastSeenAt))[0];

    const playAlertTone = async () => {
      if (typeof window === "undefined") return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        const context = audioContextRef.current;
        if (!context) return;
        if (context.state === "suspended") {
          await context.resume();
        }

        const startAt = context.currentTime + 0.02;
        [0, 0.26].forEach((offset) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(offset === 0 ? 988 : 1318, startAt + offset);
          gain.gain.setValueAtTime(0.0001, startAt + offset);
          gain.gain.exponentialRampToValueAtTime(0.08, startAt + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.22);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt + offset);
          oscillator.stop(startAt + offset + 0.24);
        });
      } catch {
        // Ignore audio failures if the browser blocks background audio.
      }
    };

    const showBrowserNotification = () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (window.Notification.permission !== "granted" || !newestThread) return;
      if (typeof document !== "undefined" && !document.hidden && document.hasFocus?.()) return;

      try {
        const notification = new window.Notification("Guest Needs Attention", {
          body: `${getConversationTitle(newestThread)} needs a human follow-up.`,
          tag: getConversationAttentionSignature(newestThread),
          renotify: true,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus?.();
          setActiveTabId("conversations");
          setSelectedConversationSessionId(newestThread.sessionId);
          notification.close();
        };
      } catch {
        // Ignore notification failures.
      }
    };

    void playAlertTone();
    showBrowserNotification();
  }, [attentionNotifiedStorageKey, attentionThreads]);

  useEffect(() => {
    if (displayedTabId !== "conversations" || !selectedConversation?.sessionId) return;
    if (!conversationNeedsAttention(selectedConversation)) return;

    const signature = getConversationAttentionSignature(selectedConversation);
    if (!signature) return;

    setAttentionSeenSignatures((current) =>
      current.includes(signature) ? current : [...current, signature],
    );
  }, [displayedTabId, selectedConversation]);

  useEffect(() => {
    // Reset summary UI when switching conversations/tabs. We do not auto-generate summaries.
    setConversationSummary(null);
    setConversationSummaryError("");
    setConversationSummaryLoading(false);

    try {
      if (conversationSummaryAbortRef.current) {
        conversationSummaryAbortRef.current.abort();
      }
    } catch {
      // ignore
    }
  }, [displayedTabId, selectedConversation?.sessionId]);

  const sanitizeConversationSummaryError = (value = "") => {
    const message = String(value || "").trim();
    if (!message) return "";
    // If the upstream error leaks tokens/keys, hide details from the UI.
    if (/sk-[A-Za-z0-9_-]{8,}/.test(message) || /api key/i.test(message)) {
      return "Server configuration issue while generating the summary.";
    }
    return message;
  };

  const handleGenerateConversationSummary = async ({ forceRefresh = false } = {}) => {
    if (!selectedConversation?.sessionId) return;
    if (!session?.accessToken && !session?.sharedKey) return;

    const sessionId = selectedConversation.sessionId;

    try {
      if (conversationSummaryAbortRef.current) {
        conversationSummaryAbortRef.current.abort();
      }
    } catch {
      // ignore
    }

    // Prefer cached summary in this browser session unless explicitly refreshed.
    if (!forceRefresh) {
      const cached = loadCachedConversationSummary(sessionId);
      if (cached?.text) {
        setConversationSummary(cached);
        setConversationSummaryError("");
        return;
      }
    }

    setConversationSummary(null);
    setConversationSummaryError("");

    const controller = new AbortController();
    conversationSummaryAbortRef.current = controller;
    setConversationSummaryLoading(true);

    const seen = loadSessionStringList(conversationSummarySeenStorageKey);

    try {
      const payload = await performAdminRequest(
        {
          method: "POST",
          payload: { action: "summarize_conversation", sessionId },
          signal: controller.signal,
        },
        session,
      );

      if (controller.signal.aborted) return;
      const text = String(payload?.summary || "").trim();
      if (!text) {
        setConversationSummaryError("Unable to summarize conversation.");
        return;
      }

      if (/^unable to generate summary\.?/i.test(text)) {
        setConversationSummaryError("Unable to summarize conversation.");
        return;
      }

      const next = {
        sessionId,
        text,
        generatedAt: String(payload?.generatedAt || ""),
        model: String(payload?.model || ""),
      };

      setConversationSummary(next);
      saveCachedConversationSummary(next);

      if (!seen.includes(sessionId)) {
        saveSessionStringList(conversationSummarySeenStorageKey, [...seen, sessionId]);
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setConversationSummaryError(
        sanitizeConversationSummaryError(String(requestError?.message || "Unable to summarize conversation.")),
      );
    } finally {
      if (controller.signal.aborted) return;
      setConversationSummaryLoading(false);
    }
  };

  const handleOpenConversationSummaryModal = async ({ forceRefresh = false } = {}) => {
    if (!selectedConversation?.sessionId) return;
    lastActiveElementRef.current = typeof document !== "undefined" ? document.activeElement : null;
    setIsConversationSummaryModalOpen(true);
    await handleGenerateConversationSummary({ forceRefresh });
  };

  const handleCloseConversationSummaryModal = () => {
    setIsConversationSummaryModalOpen(false);
    // Keep the cached summary in state; closing is just a UI action.
    try {
      lastActiveElementRef.current?.focus?.();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isConversationSummaryModalOpen) return undefined;
    if (typeof window === "undefined") return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseConversationSummaryModal();
      }
    };

    const previousOverflow = document?.body?.style?.overflow;
    if (document?.body?.style) document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKeyDown);

    const focusTimer = window.setTimeout(() => {
      conversationSummaryCloseButtonRef.current?.focus?.();
    }, 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      if (document?.body?.style) document.body.style.overflow = previousOverflow || "";
    };
  }, [isConversationSummaryModalOpen]);

  useEffect(() => {
    // If the admin switches threads, close any open summary modal to avoid mismatched context.
    setIsConversationSummaryModalOpen(false);
  }, [selectedConversation?.sessionId]);

  useEffect(() => {
    document.title =
      unreadAttentionCount > 0 ? `(${unreadAttentionCount}) OneLuxStay Admin` : "OneLuxStay Admin";
  }, [unreadAttentionCount]);

  const performAdminRequest = async ({ method = "GET", payload, signal } = {}, sessionOverride = session) => {
    const activeSession = sessionOverride || session;
    if (!activeSession?.accessToken && !activeSession?.sharedKey) {
      throw new Error("Admin session not found.");
    }

    const buildRequest = (resolvedSession) =>
      fetch(`${apiBase}/admins-ols`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...getAdminsOlsAuthHeaders(resolvedSession),
        },
        signal,
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });

    let response = await buildRequest(activeSession);

    if ((response.status === 401 || response.status === 403) && activeSession?.refreshToken) {
      const refreshedSession = await refreshAdminsOlsSession(apiBase, activeSession).catch(() => null);
      if (refreshedSession?.accessToken) {
        setSession(refreshedSession);
        response = await buildRequest(refreshedSession);
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAdminsOlsSession();
        setSession(null);
      }
      throw new Error(data?.error || "Admin request failed.");
    }

    return data;
  };

  const fetchDashboard = async (sessionOverride = session, { silent = false } = {}) => {
    if (!sessionOverride?.accessToken && !sessionOverride?.sharedKey) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const payload = await performAdminRequest({ method: "GET" }, sessionOverride);
      setDashboard(payload);
      if (!silent) {
        setNotice(`Dashboard refreshed ${formatDateTime(payload?.generatedAt)}`);
      }
    } catch (requestError) {
      const message = String(requestError?.message || "Unable to load admin dashboard.");
      if (!silent) {
        setDashboard(null);
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return;
    fetchDashboard(session);
  }, [session?.accessToken, session?.sharedKey]);

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return undefined;
    if (typeof window === "undefined") return undefined;

    const intervalId = window.setInterval(() => {
      fetchDashboard(session, { silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [session]);

  const handleAdminAction = async (payload) => performAdminRequest({ method: "POST", payload });

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) {
      hasLoggedDashboardOpenRef.current = false;
      return;
    }
    if (hasLoggedDashboardOpenRef.current) return;
    if (!shouldLogDashboardOpen()) return;

    hasLoggedDashboardOpenRef.current = true;
    handleAdminAction({
      action: "log_activity",
      eventType: "dashboard_opened",
      message: "Opened the Concierge Intelligence Panel.",
      details: {
        source: "dashboard_ui",
      },
    }).catch(() => null);
  }, [session?.accessToken, session?.sharedKey]);

  const handleNavigateToSection = (sectionId = "") => {
    if (!sectionId) return;
    setActiveTabId(sectionId);
    setIsSidebarOpen(false);
  };

  const handleCollapseSidebar = () => {
    if (isSidebarCollapsed || sidebarDesktopPhase === "collapsing") return;
    if (sidebarPhaseTimeoutRef.current) {
      window.clearTimeout(sidebarPhaseTimeoutRef.current);
      sidebarPhaseTimeoutRef.current = null;
    }
    setSidebarDesktopPhase("collapsing");
    sidebarPhaseTimeoutRef.current = window.setTimeout(() => {
      setIsSidebarCollapsed(true);
      setSidebarDesktopPhase("idle");
      sidebarPhaseTimeoutRef.current = null;
    }, 180);
  };

  const handleExpandSidebar = () => {
    if (!isSidebarCollapsed || sidebarDesktopPhase === "expanding") return;
    if (sidebarPhaseTimeoutRef.current) {
      window.clearTimeout(sidebarPhaseTimeoutRef.current);
      sidebarPhaseTimeoutRef.current = null;
    }
    setIsSidebarCollapsed(false);
    setSidebarDesktopPhase("expanding");
    sidebarPhaseTimeoutRef.current = window.setTimeout(() => {
      setSidebarDesktopPhase("idle");
      sidebarPhaseTimeoutRef.current = null;
    }, 520);
  };

  const handleManualRefresh = async () => {
    await fetchDashboard();
    await handleAdminAction({
      action: "log_activity",
      eventType: "manual_refresh",
      message: "Manually refreshed the admin dashboard.",
      details: {
        source: "dashboard_ui",
      },
    }).catch(() => null);
    await fetchDashboard(session, { silent: true });
  };

  const handleEnableAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("Browser notifications are not supported in this browser.");
      return;
    }

    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setNotice("Desktop alerts enabled. New attention threads can now notify you.");
      } else {
        setNotice("Desktop alerts were not enabled. You can still use the in-dashboard badge alerts.");
      }
    } catch {
      setError("Unable to enable desktop alerts right now.");
    }
  };

  const handleSaveLesson = async (event) => {
    event.preventDefault();
    setSavingLesson(true);
    setError("");
    setNotice("");

    try {
      await handleAdminAction({
        action: "create_lesson",
        ...lessonForm,
      });
      setLessonForm({ ...DEFAULT_FORM });
      setNotice("Sentiment lesson saved. The concierge can now use it as coaching context.");
      await fetchDashboard();
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to save sentiment lesson."));
    } finally {
      setSavingLesson(false);
    }
  };

  const handleToggleLesson = async (lessonId, active) => {
    setBusyLessonId(lessonId);
    setError("");
    try {
      await handleAdminAction({
        action: "set_lesson_active",
        lessonId,
        active,
      });
      setNotice(active ? "Lesson activated." : "Lesson deactivated.");
      await fetchDashboard();
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to update lesson."));
    } finally {
      setBusyLessonId("");
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    setBusyLessonId(lessonId);
    setError("");
    try {
      await handleAdminAction({
        action: "delete_lesson",
        lessonId,
      });
      setNotice("Lesson deleted.");
      await fetchDashboard();
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to delete lesson."));
    } finally {
      setBusyLessonId("");
    }
  };

  const handleSendReply = async (event) => {
    event.preventDefault();
    if (!selectedConversation?.sessionId) return;

    const content = String(replyDraft || "").trim();
    if (!content) return;

    setSendingReply(true);
    setError("");
    setNotice("");

    try {
      const response = await handleAdminAction({
        action: "send_reply",
        sessionId: selectedConversation.sessionId,
        content,
        pageContext: {
          pageType: selectedConversation.pageType,
          city: selectedConversation.city,
          listingId: selectedConversation.listingId,
          pathname: selectedConversation.pathname,
        },
      });

      if (response?.message?.messageId) {
        setDashboard((current) =>
          injectMessageIntoDashboard(
            current,
            {
              sessionId: selectedConversation.sessionId,
              pageType: selectedConversation.pageType,
              city: selectedConversation.city,
              listingId: selectedConversation.listingId,
              pathname: selectedConversation.pathname,
              lastSeenAt: selectedConversation.lastSeenAt,
            },
            response.message,
          ),
        );
      }

      setReplyDraft("");
      setNotice("Reply sent to the conversation.");
      await fetchDashboard(session, { silent: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to send reply."));
    } finally {
      setSendingReply(false);
    }
  };

  const handleAccountFieldChange = (field) => (event) => {
    const value = event?.target?.value ?? "";
    setAccountForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveAccount = async (event) => {
    event.preventDefault();
    setSavingAccount(true);
    setError("");
    setNotice("");

    try {
      if (isSharedKeySession) {
        throw new Error("Account updates are disabled for shared-key sessions. Sign in with email/password instead.");
      }

      const fullName = String(accountForm.fullName || "").trim();
      const currentPassword = String(accountForm.currentPassword || "");
      const newPassword = String(accountForm.newPassword || "");
      const confirmPassword = String(accountForm.confirmPassword || "");
      const currentFullName = String(currentAdmin?.fullName || "").trim();
      const shouldUpdateProfile = Boolean(fullName) && fullName !== currentFullName;
      const shouldUpdatePassword = Boolean(currentPassword || newPassword || confirmPassword);

      if (!shouldUpdateProfile && !shouldUpdatePassword) {
        throw new Error("No account changes to save.");
      }

      if (shouldUpdatePassword) {
        if (!currentPassword) throw new Error("Current password is required.");
        if (!newPassword) throw new Error("New password is required.");
        if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
        if (newPassword !== confirmPassword) throw new Error("New password and confirmation do not match.");
      }

      const response = await handleAdminAction({
        action: "update_account",
        fullName: shouldUpdateProfile ? fullName : "",
        currentPassword: shouldUpdatePassword ? currentPassword : "",
        newPassword: shouldUpdatePassword ? newPassword : "",
        confirmPassword: shouldUpdatePassword ? confirmPassword : "",
      });

      const updatedAdmin = response?.currentAdmin || response?.account?.user || null;
      if (updatedAdmin?.id) {
        setSession((currentSession) => {
          if (!currentSession) return currentSession;
          const nextSession = saveAdminsOlsSession({
            ...currentSession,
            user: {
              ...(currentSession.user || {}),
              ...updatedAdmin,
            },
          });
          return nextSession || currentSession;
        });
        setDashboard((current) =>
          current
            ? {
                ...current,
                currentAdmin: {
                  ...(current.currentAdmin || {}),
                  ...updatedAdmin,
                },
              }
            : current,
        );
      }

      setAccountForm((current) => ({
        ...current,
        fullName: updatedAdmin?.fullName || fullName || current.fullName,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));

      setNotice(
        response?.account?.passwordUpdated
          ? "Account updated. Password changed successfully."
          : "Account profile updated.",
      );
      await fetchDashboard(session, { silent: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to update account."));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleInviteFieldChange = (field) => (event) => {
    const value = event?.target?.type === "checkbox" ? Boolean(event.target.checked) : event.target.value;
    setInviteForm((current) => ({ ...current, [field]: value }));
  };

  const handleSendInvite = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    if (!session) {
      setError("You must be signed in to invite admins.");
      pushToast({
        tone: "negative",
        title: "Invite blocked",
        message: "You must be signed in to invite admins.",
      });
      return;
    }

    setSendingInvite(true);
    setError("");
    setNotice("");
    setLastInviteLink("");

    try {
      const inferredOrigin =
        String(system?.siteUrl || "").trim() ||
        (typeof window !== "undefined" ? String(window.location.origin || "").trim() : "");
      const redirectTo = inferredOrigin ? `${inferredOrigin.replace(/\/+$/, "")}/admins-ols/accept` : "";

      const fullName = String(inviteForm.fullName || "").trim();
      if (!fullName) throw new Error("Full name is required.");
      if (fullName.split(/\s+/).filter(Boolean).length < 2) {
        throw new Error("Full name must include first and last name.");
      }

      const response = await fetch(`${apiBase}/admins-ols`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminsOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          action: "invite_admin",
          email: inviteForm.email,
          fullName,
          role: inviteForm.role,
          redirectTo,
          forceResend: inviteForm.forceResend,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.invite?.email) {
        throw new Error(payload?.error || "Unable to send admin invite.");
      }

      if (payload?.invite?.alreadyInvited) {
        const sentAt = payload?.invite?.lastInvitedAt ? formatDateTime(payload.invite.lastInvitedAt) : "recently";
        if (payload?.invite?.actionLink) {
          setLastInviteLink(payload.invite.actionLink);
        }
        pushToast(
          payload?.invite?.actionLink
            ? {
                tone: "warning",
                title: "Invite already sent",
                message: `An invitation for ${payload.invite.email} was already sent ${sentAt}. Backup link is ready below.`,
              }
            : payload?.invite?.warning
              ? {
                  tone: "warning",
                  title: "Invite already sent",
                  message: `An invitation for ${payload.invite.email} was already sent ${sentAt}. ${payload.invite.warning}`,
                }
              : {
                  tone: "warning",
                  title: "Invite already sent",
                  message: `An invitation for ${payload.invite.email} was already sent ${sentAt}.`,
                },
        );
        setNotice(
          payload?.invite?.actionLink
            ? `Invite already sent for ${payload.invite.email}. Backup invite link is ready below.`
            : `Invite already sent for ${payload.invite.email}.`,
        );
        return;
      }

      setInviteForm((current) => ({
        ...current,
        email: "",
        forceResend: false,
      }));

      if (payload?.invite?.actionLink) {
        setLastInviteLink(payload.invite.actionLink);
      }

      if (payload?.invite?.inviteSent === false && payload?.invite?.actionLink) {
        setLastInviteLink(payload.invite.actionLink);
        setNotice(
          payload?.invite?.warning
            ? `Email invite could not be sent. Copy the invite link below and share it with ${payload.invite.email}.`
            : `Copy the invite link below and share it with ${payload.invite.email}.`,
        );
        pushToast({
          tone: "warning",
          title: "Email invite failed",
          message: payload?.invite?.warning
            ? `${payload.invite.warning} Copy the manual invite link.`
            : "Copy the manual invite link and share it with the admin.",
        });
      } else {
        const hasBackup = Boolean(payload?.invite?.actionLink);
        const warning = String(payload?.invite?.warning || "").trim();

        setNotice(
          hasBackup
            ? `Invite sent to ${payload.invite.email}. Backup invite link is ready below in case email delivery is delayed.`
            : `Invite sent to ${payload.invite.email}.`,
        );

        pushToast({
          tone: !hasBackup && warning ? "warning" : "positive",
          title: !hasBackup && warning ? "Invite sent (no backup link)" : "Invite sent",
          message: hasBackup
            ? `Invitation sent to ${payload.invite.email}. If it doesn't show up, use the backup link.`
            : warning
              ? `Invitation sent to ${payload.invite.email}. ${warning}`
              : `Invitation sent to ${payload.invite.email}.`,
        });
      }
    } catch (requestError) {
      const message = String(requestError?.message || "Unable to send admin invite.");
      setError(message);
      pushToast({
        tone: "negative",
        title: "Invite error",
        message,
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleLogout = async () => {
    await handleAdminAction({
      action: "log_activity",
      eventType: "sign_out",
      message: "Signed out from the Concierge Intelligence Panel.",
      details: {
        source: "dashboard_ui",
      },
    }).catch(() => null);
    clearAdminsOlsSession();
    setSession(null);
    setDashboard(null);
    setNotice("");
    setError("");
  };

  const navItems = [
    { id: "overview", label: "Overview" },
    { id: "system", label: "System" },
    { id: "conversations", label: "Conversations" },
    { id: "lessons", label: "Lessons" },
    { id: "feedback", label: "Feedback" },
    { id: "assistant-turns", label: "Assistant Turns" },
    { id: "account", label: "Account" },
  ];

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/admins-ols/login" replace />;
  }

  return (
    <>
      <div className="admins-ols-page">
      {toasts.length > 0 && (
        <div className="admins-ols-toasts" role="status" aria-live="polite" aria-relevant="additions">
          {toasts.map((toast) => (
            <div key={toast.id} className={`admins-ols-toast is-${toast.tone}`}>
              <div className="admins-ols-toast-head">
                <strong>{toast.title || "Notification"}</strong>
                <button type="button" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
                  ×
                </button>
              </div>
              {toast.message && <p>{toast.message}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="admins-ols-shell">
        <div className="admins-ols-mobile-nav">
          <button
            type="button"
            className={`admins-ols-mobile-nav-toggle${isSidebarOpen ? " is-active" : ""}`}
            onClick={() => setIsSidebarOpen((current) => !current)}
            aria-expanded={isSidebarOpen}
            aria-controls="admins-ols-sidebar"
          >
            {isSidebarOpen ? "Close Panel" : "Open Panel"}
          </button>
          <div>
            <strong>Admin Navigation</strong>
            <small>
              {isSuperAdmin
                ? "Profile menu, admin tools, and superadmin logs"
                : "Profile menu and admin tools"}
            </small>
          </div>
        </div>

        <div
          className={`admins-ols-layout${isSidebarOpen ? " is-sidebar-open" : ""}${
            isSidebarCollapsed ? " is-sidebar-collapsed" : ""
          }${sidebarDesktopPhase === "collapsing" ? " is-sidebar-collapsing" : ""}${
            sidebarDesktopPhase === "expanding" ? " is-sidebar-expanding" : ""
          }`}
        >
          <aside
            id="admins-ols-sidebar"
            className="admins-ols-sidebar"
            aria-label="Admin profile and workspace tools"
          >
            <div className="admins-ols-side-sticky">
              <section className="admins-ols-side-section admins-ols-side-section--profile">
                <div className="admins-ols-card-head">
                  <h3>Profile & Tools</h3>
                  <button
                    type="button"
                    className="admins-ols-sidebar-toggle admins-ols-sidebar-toggle--inside"
                    onClick={handleCollapseSidebar}
                    aria-controls="admins-ols-sidebar"
                    aria-expanded
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <span aria-hidden="true">«</span>
                  </button>
                </div>
                <div className="admins-ols-profile-card">
                  <div className="admins-ols-profile-head">
                    <div className="admins-ols-profile-avatar">{getAdminInitials(currentAdmin)}</div>
                    <div className="admins-ols-profile-meta">
                      <strong>{currentAdmin.fullName || currentAdmin.email || "Admin"}</strong>
                      <small>{currentAdmin.email || "No email available"}</small>
                    </div>
                  </div>
                  <div className="admins-ols-badge-row">
                    <span className={`admins-ols-badge ${isSuperAdmin ? "is-active" : "is-neutral"}`}>
                      {isSuperAdmin ? "Superadmin" : "Admin"}
                    </span>
                    <span className="admins-ols-pill">
                      {isSharedKeySession ? "Shared Key Session" : "Supabase Auth"}
                    </span>
                  </div>
                  <p className="admins-ols-note">
                    Tabs above control content. Use this menu for account and logs.
                  </p>
                </div>
                <div className="admins-ols-profile-actions">
                  <button
                    type="button"
                    className="admins-ols-profile-action"
                    onClick={() => handleNavigateToSection("account")}
                  >
                    Account Settings
                  </button>
                  {isSuperAdmin && (
                    <Link className="admins-ols-profile-action" to="/admins-ols/audit">
                      <span>Superadmin Audit Log</span>
                      <span className="admins-ols-side-nav-count">{recentAdminActivity.length || "Go"}</span>
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link className="admins-ols-profile-action" to="/admins-ols/guest-journeys">
                      <span>Guest Journey Log</span>
                      <span className="admins-ols-side-nav-count">{recentGuestJourneyEvents.length || "Go"}</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    className={`admins-ols-profile-action${unreadAttentionCount > 0 ? " is-attention" : ""}`}
                    onClick={() => handleNavigateToSection("conversations")}
                  >
                    <span>Attention Alerts</span>
                    <span className="admins-ols-side-nav-count">{unreadAttentionCount}</span>
                  </button>
                  <button
                    type="button"
                    className="admins-ols-profile-action is-danger"
                    onClick={handleLogout}
                  >
                    Sign Out
                  </button>
                </div>
              </section>
            </div>
          </aside>

          <main className="admins-ols-main">
            {isSidebarCollapsed && (
              <button
                type="button"
                className="admins-ols-sidebar-toggle admins-ols-sidebar-toggle--collapsed"
                onClick={handleExpandSidebar}
                aria-controls="admins-ols-sidebar"
                aria-expanded={false}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <span aria-hidden="true">»</span>
              </button>
            )}
            <header className="admins-ols-hero">
              <div className="admins-ols-hero-content">
                <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
                <h1>Concierge Intelligence Panel</h1>
                <p className="admins-ols-hero-copy">
                  Monitor the concierge, review what guests are asking, and teach the AI how to handle
                  guest sentiment with better tone and response structure.
                </p>
                <p className="admins-ols-note">
                  Signed in as <strong>{currentAdmin.fullName || currentAdmin.email || "Admin"}</strong>
                  {currentAdmin.email ? ` (${currentAdmin.email})` : ""}
                </p>
              </div>
              <div className="admins-ols-toolbar">
                <button
                  type="button"
                  className={`admins-ols-toolbar-alert-btn${
                    notificationPermission === "granted" ? " is-enabled" : ""
                  }`}
                  onClick={handleEnableAlerts}
                  disabled={notificationPermission === "unsupported"}
                  title={
                    notificationPermission === "granted"
                      ? "Desktop alerts are enabled"
                      : notificationPermission === "denied"
                        ? "Desktop alerts are blocked in this browser"
                        : notificationPermission === "unsupported"
                          ? "Desktop alerts are not supported in this browser"
                          : "Enable desktop alerts"
                  }
                >
                  <span>
                    {notificationPermission === "granted"
                      ? "Alerts On"
                      : notificationPermission === "denied"
                        ? "Alerts Blocked"
                        : notificationPermission === "unsupported"
                          ? "Alerts Unsupported"
                          : "Enable Alerts"}
                  </span>
                  {unreadAttentionCount > 0 && (
                    <span className="admins-ols-side-nav-count">{unreadAttentionCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="admins-ols-toolbar-icon-btn"
                  onClick={handleManualRefresh}
                  disabled={loading}
                  aria-label={loading ? "Refreshing dashboard" : "Refresh dashboard"}
                  title={loading ? "Refreshing..." : "Refresh dashboard"}
                >
                  {loading ? "…" : "↻"}
                </button>
              </div>
            </header>

            {notice && <div className="admins-ols-banner">{notice}</div>}
            {error && <div className="admins-ols-error">{error}</div>}

            <section className="admins-ols-card admins-ols-tabs-card" aria-label="Admin panel tabs">
              <div className="admins-ols-tablist" role="tablist" aria-label="Admin dashboard sections">
                {navItems.map((item) => (
                  <button
                    key={`tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={activeTabId === item.id}
                    aria-controls={`panel-${item.id}`}
                    id={`tab-${item.id}`}
                    className={`admins-ols-tab${activeTabId === item.id ? " is-active" : ""}`}
                    onClick={() => handleNavigateToSection(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.id === "conversations" && unreadAttentionCount > 0 && (
                      <span className="admins-ols-side-nav-count">{unreadAttentionCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <div className={`admins-ols-tab-panels ${tabContentPhase}`}>
            <section
              id="panel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              hidden={displayedTabId !== "overview"}
              className="admins-ols-grid admins-ols-grid--stats"
            >
          <article className="admins-ols-card admins-ols-stat">
            <span>Total Sessions</span>
            <strong>{overview.sessionsTotal ?? "--"}</strong>
            <small>Tracked concierge browsing sessions</small>
          </article>
          <article className="admins-ols-card admins-ols-stat">
            <span>Total Messages</span>
            <strong>{overview.messagesTotal ?? "--"}</strong>
            <small>User + assistant turns stored in Supabase</small>
          </article>
          <article className="admins-ols-card admins-ols-stat">
            <span>Feedback Health</span>
            <strong>{feedbackHealth.goodRate}% good</strong>
            <small>
              {overview.goodFeedbackTotal ?? 0} good / {overview.badFeedbackTotal ?? 0} bad
            </small>
          </article>
          <article className="admins-ols-card admins-ols-stat">
            <span>Sentiment Lessons</span>
            <strong>{overview.activeLessonsTotal ?? 0}</strong>
            <small>{overview.lessonsTotal ?? 0} saved, active lessons feed the prompt</small>
          </article>
        </section>

        <section
          id="panel-system"
          role="tabpanel"
          aria-labelledby="tab-system"
          hidden={displayedTabId !== "system"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>AI System Status</h2>
              <span className={`admins-ols-pill${system.learningEnabled ? " is-live" : ""}`}>
                {system.learningEnabled ? "Learning On" : "Learning Off"}
              </span>
            </div>
            <dl className="admins-ols-definition-list">
              <div>
                <dt>Chat model</dt>
                <dd>{system.chatModel || "--"}</dd>
              </div>
              <div>
                <dt>AI query model</dt>
                <dd>{system.aiQueryModel || "--"}</dd>
              </div>
              <div>
                <dt>Embedding model</dt>
                <dd>{system.embeddingModel || "--"}</dd>
              </div>
              <div>
                <dt>Data provider</dt>
                <dd>{system.dataProvider || "--"}</dd>
              </div>
              <div>
                <dt>Deploy context</dt>
                <dd>{system.deployContext || "--"}</dd>
              </div>
              <div>
                <dt>Site URL</dt>
                <dd>{system.siteUrl || "--"}</dd>
              </div>
            </dl>
          </article>

          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Admin Rollups</h2>
              <span className="admins-ols-pill">Recent activity</span>
            </div>
            <div className="admins-ols-rollups">
              <div>
                <h3>Top cities</h3>
                <ul>
                  {(rollups.topCities || []).map((item) => (
                    <li key={`city-${item.label}`}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Top page types</h3>
                <ul>
                  {(rollups.topPageTypes || []).map((item) => (
                    <li key={`page-${item.label}`}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Sentiment coverage</h3>
                <ul>
                  {(rollups.lessonsBySentiment || []).map((item) => (
                    <li key={`lesson-${item.label}`}>
                      <span>{sentimentToneLabel(item.label)}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Top guest cities</h3>
                <ul>
                  {(rollups.topGuestCities || []).map((item) => (
                    <li key={`guest-city-${item.label}`}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Top guest events</h3>
                <ul>
                  {(rollups.topGuestEventTypes || []).map((item) => (
                    <li key={`guest-event-${item.label}`}>
                      <span>{formatGuestJourneyEventLabel(item.label)}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </section>

        <section
          id="panel-conversations"
          role="tabpanel"
          aria-labelledby="tab-conversations"
          hidden={displayedTabId !== "conversations"}
          className="admins-ols-card"
        >
          <div className="admins-ols-card-head">
            <h2>Recent Conversations</h2>
            <span className="admins-ols-pill">{recentConversations.length} sessions</span>
          </div>
          <div className="admins-ols-messenger">
            <div className="admins-ols-messenger-list" role="list" aria-label="Recent conversation sessions">
              {recentConversations.map((thread) => {
                const latestMessage = thread.messages?.[thread.messages.length - 1] || null;
                const isActive = thread.sessionId === selectedConversation?.sessionId;
                const needsAttention = conversationNeedsAttention(thread);

                return (
                  <button
                    key={thread.sessionId}
                    type="button"
                    className={`admins-ols-messenger-item${isActive ? " is-active" : ""}`}
                    onClick={() => setSelectedConversationSessionId(thread.sessionId)}
                  >
                    <div className="admins-ols-messenger-item-avatar">{getConversationInitial(thread)}</div>
                    <div className="admins-ols-messenger-item-body">
                      <div className="admins-ols-messenger-item-top">
                        <strong>{getConversationTitle(thread)}</strong>
                        <small>{formatDateTime(thread.lastSeenAt)}</small>
                      </div>
                      <div className="admins-ols-messenger-item-sub">
                        <span>{formatPageLabel(thread.pageType)}</span>
                        <span>
                          {isWhatsAppConversation(thread)
                            ? getWhatsAppPhoneLabel(thread) || "WhatsApp guest"
                            : thread.listingId
                              ? `Listing ${shortenId(thread.listingId)}`
                              : "No listing"}
                        </span>
                      </div>
                      <p>{getConversationPreview(thread)}</p>
                      <div className="admins-ols-messenger-item-foot">
                        <span>{thread.messageCount} messages</span>
                        {latestMessage?.cardCount > 0 && <span>{latestMessage.cardCount} cards</span>}
                        {needsAttention && <span className="admins-ols-badge is-negative">Needs attention</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!recentConversations.length && (
                <p className="admins-ols-empty">No conversation threads found yet.</p>
              )}
            </div>

            <div className="admins-ols-messenger-thread">
              {selectedConversation ? (
                <>
                  {conversationNeedsAttention(selectedConversation) && (
                    <div className="admins-ols-conversation-alert">
                      <span className="admins-ols-badge is-negative">Needs attention</span>
                      <p>The concierge paused this thread because it started repeating or could not answer clearly.</p>
                    </div>
                  )}
                  <div className="admins-ols-conversation-head">
                    <div className="admins-ols-conversation-head-main">
                      <p className="admins-ols-conversation-kicker">
                        {formatPageLabel(selectedConversation.pageType)}
                      </p>
                      <h3 className="admins-ols-conversation-title">
                        {getConversationTitle(selectedConversation)}
                      </h3>
                      <div className="admins-ols-conversation-meta">
                        <span>
                          {isWhatsAppConversation(selectedConversation)
                            ? getWhatsAppPhoneLabel(selectedConversation) || "WhatsApp guest"
                            : selectedConversation.city && selectedConversation.city.toLowerCase() !== "unknown city"
                            ? selectedConversation.city
                            : "Website"}
                        </span>
                        <span>
                          {isWhatsAppConversation(selectedConversation)
                            ? "Twilio WhatsApp"
                            : selectedConversation.listingId
                            ? `Listing ${shortenId(selectedConversation.listingId)}`
                            : "No listing"}
                        </span>
                        <span>{selectedConversation.messageCount} messages</span>
                        {conversationNeedsAttention(selectedConversation) && (
                          <span className="admins-ols-badge is-negative">Needs attention</span>
                        )}
                      </div>
                    </div>
                    <div className="admins-ols-conversation-head-aside">
                      <small>{formatDateTime(selectedConversation.lastSeenAt)}</small>
                      <button
                        type="button"
                        className="admins-ols-conversation-summary-trigger"
                        onClick={() =>
                          handleOpenConversationSummaryModal({
                            forceRefresh: false,
                          })
                        }
                        disabled={conversationSummaryLoading}
                        title="Generate a quick admin summary for this thread"
                      >
                        {conversationSummaryLoading
                          ? "Summarizing..."
                          : cachedSelectedConversationSummary?.text ||
                              (conversationSummary?.sessionId === selectedConversation.sessionId &&
                                String(conversationSummary?.text || "").trim())
                            ? "View Summary"
                            : "Generate Summary"}
                      </button>
                    </div>
                  </div>
                  {selectedConversation.pathname && (
                    <p className="admins-ols-conversation-path">
                      {truncate(selectedConversation.pathname, 120)}
                    </p>
                  )}
                  <div className="admins-ols-thread" ref={threadScrollRef}>
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={`${selectedConversation.sessionId}-${message.messageId}`}
                        className={`admins-ols-thread-bubble ${getConversationMessageBubbleClass(message)}`}
                      >
                        <div className="admins-ols-thread-bubble-head">
                          <span
                            className={`admins-ols-badge is-${
                              message.role === "user"
                                ? "neutral"
                                : getConversationMessageSenderType(message) === "admin"
                                  ? "active"
                                  : "positive"
                            }`}
                          >
                            {getConversationMessageLabel(message)}
                          </span>
                          <small>{formatDateTime(message.createdAt)}</small>
                        </div>
                        <p>{message.content || "No message content captured."}</p>
                        {message.cardCount > 0 && (
                          <small>{message.cardCount} linked listing cards</small>
                        )}
                      </div>
                    ))}
                  </div>
                  <form className="admins-ols-thread-composer" onSubmit={handleSendReply}>
                    <label htmlFor="admins-ols-reply" className="admins-ols-thread-composer-label">
                      {isWhatsAppConversation(selectedConversation) ? "Reply to WhatsApp guest" : "Reply as admin"}
                    </label>
                    <div className="admins-ols-thread-composer-row">
                      <textarea
                        id="admins-ols-reply"
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder={
                          isWhatsAppConversation(selectedConversation)
                            ? "Send a WhatsApp reply as the OneLuxStay team..."
                            : "Reply to this guest conversation as the OneLuxStay team..."
                        }
                        rows={3}
                        disabled={sendingReply}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!sendingReply && replyDraft.trim()) {
                              handleSendReply(event);
                            }
                          }
                        }}
                      />
                      <button type="submit" disabled={sendingReply || !replyDraft.trim()}>
                        {sendingReply ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p className="admins-ols-empty">Select a conversation to read the thread.</p>
              )}
            </div>
          </div>
        </section>

        <section
          id="panel-lessons"
          role="tabpanel"
          aria-labelledby="tab-lessons"
          hidden={displayedTabId !== "lessons"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card admins-ols-card--teacher">
            <div className="admins-ols-card-head">
              <h2>Teach AI Sentiment</h2>
              <span className="admins-ols-pill">Prompt coaching</span>
            </div>
            <p className="admins-ols-copy">
              Add live teaching notes for how the concierge should respond when a guest sounds
              frustrated, neutral, or delighted. These lessons are injected into the concierge
              prompt as active coaching context.
            </p>
            <form className="admins-ols-form" onSubmit={handleSaveLesson}>
              <label>
                Lesson title
                <input
                  type="text"
                  value={lessonForm.title}
                  onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Frustrated guest wants faster reassurance"
                />
              </label>
              <label>
                Sentiment label
                <select
                  value={lessonForm.sentimentLabel}
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, sentimentLabel: event.target.value }))
                  }
                >
                  <option value="negative">Negative</option>
                  <option value="neutral">Neutral</option>
                  <option value="positive">Positive</option>
                </select>
              </label>
              <label>
                Trigger signals
                <textarea
                  value={lessonForm.triggerText}
                  onChange={(event) => setLessonForm((current) => ({ ...current, triggerText: event.target.value }))}
                  placeholder="Upset about pricing mismatch, worried about reservation status, asks for urgent help"
                  rows={3}
                />
              </label>
              <label>
                Preferred response guidance
                <textarea
                  value={lessonForm.responseGuidance}
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, responseGuidance: event.target.value }))
                  }
                  placeholder="Acknowledge the frustration first, confirm the next action clearly, keep the reply short, and offer human escalation."
                  rows={4}
                />
              </label>
              <label>
                Example user message
                <textarea
                  value={lessonForm.exampleUserMessage}
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, exampleUserMessage: event.target.value }))
                  }
                  placeholder="I already paid and still don't know if my booking is confirmed."
                  rows={3}
                />
              </label>
              <label>
                Example assistant style
                <textarea
                  value={lessonForm.exampleAssistantStyle}
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, exampleAssistantStyle: event.target.value }))
                  }
                  placeholder="I understand why that feels stressful. If you share your reservation code, I'll check the status now."
                  rows={3}
                />
              </label>
              <label>
                Admin notes
                <textarea
                  value={lessonForm.adminNotes}
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, adminNotes: event.target.value }))
                  }
                  placeholder="Use this for tone calibration, edge cases, or brand voice reminders."
                  rows={3}
                />
              </label>
              <label className="admins-ols-checkbox">
                <input
                  type="checkbox"
                  checked={lessonForm.active}
                  onChange={(event) => setLessonForm((current) => ({ ...current, active: event.target.checked }))}
                />
                <span>Make lesson active immediately</span>
              </label>
              <button type="submit" disabled={savingLesson}>
                {savingLesson ? "Saving lesson..." : "Save Sentiment Lesson"}
              </button>
            </form>
          </article>

          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Current Lessons</h2>
              <span className="admins-ols-pill">{sentimentLessons.length} loaded</span>
            </div>
            <div className="admins-ols-lesson-list">
              {sentimentLessons.length === 0 && (
                <p className="admins-ols-empty">No sentiment lessons yet. Add the first lesson from the form.</p>
              )}
              {sentimentLessons.map((lesson) => {
                const submittedBy = getLessonActorLabel(lesson.createdBy);
                const updatedBy = getLessonActorLabel(lesson.updatedBy);
                return (
                  <article key={lesson.id} className="admins-ols-lesson">
                  <div className="admins-ols-lesson-head">
                    <div className="admins-ols-lesson-head-main">
                      <h3>{lesson.title}</h3>
                      <div className="admins-ols-badge-row admins-ols-lesson-meta">
                        <span className={`admins-ols-badge is-${lesson.sentimentLabel || "neutral"}`}>
                          {sentimentToneLabel(lesson.sentimentLabel)}
                        </span>
                        <span className={`admins-ols-badge${lesson.active ? " is-active" : " is-inactive"}`}>
                          {lesson.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    <div className="admins-ols-lesson-actions">
                      <button
                        type="button"
                        className="is-secondary"
                        disabled={busyLessonId === lesson.id}
                        onClick={() => handleToggleLesson(lesson.id, !lesson.active)}
                      >
                        {lesson.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        disabled={busyLessonId === lesson.id}
                        onClick={() => handleDeleteLesson(lesson.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="admins-ols-lesson-body">
                    {lesson.triggerText && (
                      <div className="admins-ols-lesson-field is-wide">
                        <span className="admins-ols-lesson-label">Trigger</span>
                        <p>{lesson.triggerText}</p>
                      </div>
                    )}
                    <div className="admins-ols-lesson-field is-wide">
                      <span className="admins-ols-lesson-label">Guidance</span>
                      <p>{lesson.responseGuidance}</p>
                    </div>
                    {lesson.exampleUserMessage && (
                      <div className="admins-ols-lesson-field">
                        <span className="admins-ols-lesson-label">Example Guest</span>
                        <p>{lesson.exampleUserMessage}</p>
                      </div>
                    )}
                    {lesson.exampleAssistantStyle && (
                      <div className="admins-ols-lesson-field">
                        <span className="admins-ols-lesson-label">Preferred Reply Style</span>
                        <p>{lesson.exampleAssistantStyle}</p>
                      </div>
                    )}
                    {lesson.adminNotes && (
                      <div className="admins-ols-lesson-field is-wide">
                        <span className="admins-ols-lesson-label">Notes</span>
                        <p>{lesson.adminNotes}</p>
                      </div>
                    )}
                  </div>
                  <div className="admins-ols-lesson-footer">
                    <small>
                      Submitted by {submittedBy || "legacy record"} on{" "}
                      {formatDateTime(lesson.createdAt)}
                    </small>
                    <small>Updated {formatDateTime(lesson.updatedAt)}</small>
                    {updatedBy && <small>Last updated by {updatedBy}</small>}
                  </div>
                  </article>
                );
              })}
            </div>
          </article>
        </section>

        <section
          id="panel-feedback"
          role="tabpanel"
          aria-labelledby="tab-feedback"
          hidden={displayedTabId !== "feedback"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Recent Feedback</h2>
              <span className="admins-ols-pill">{recentFeedback.length} rows</span>
            </div>
            <div className="admins-ols-stack">
              {recentFeedback.map((item) => (
                <article key={`${item.sessionId}-${item.messageId}`} className="admins-ols-log">
                  <div className="admins-ols-log-meta">
                    <span className={`admins-ols-badge is-${item.rating === "bad" ? "negative" : "positive"}`}>
                      {item.rating === "bad" ? "Bad" : "Good"}
                    </span>
                    <small>{formatDateTime(item.updatedAt)}</small>
                  </div>
                  <p><strong>User:</strong> {truncate(item.userMessage || "No user text captured.", 180)}</p>
                  <p><strong>Assistant:</strong> {truncate(item.assistantMessage || "No assistant text captured.", 220)}</p>
                  <small>
                    {item.pageContext.city || "Unknown city"} | {item.pageContext.pageType || "Unknown page"} |{" "}
                    {item.pageContext.listingId || "No listing"}
                  </small>
                </article>
              ))}
              {!recentFeedback.length && <p className="admins-ols-empty">No feedback records yet.</p>}
            </div>
          </article>

          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Recent Sessions</h2>
              <span className="admins-ols-pill">{recentSessions.length} sessions</span>
            </div>
            <div className="admins-ols-table-wrap">
              <table className="admins-ols-table">
                <thead>
                  <tr>
                    <th>Last Seen</th>
                    <th>City</th>
                    <th>Page Type</th>
                    <th>Listing</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((item) => (
                    <tr key={item.sessionId}>
                      <td>{formatDateTime(item.lastSeenAt)}</td>
                      <td>{item.city || "--"}</td>
                      <td>{item.pageType || "--"}</td>
                      <td>{item.listingId || "--"}</td>
                      <td>{truncate(item.pathname || "--", 60)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!recentSessions.length && <p className="admins-ols-empty">No sessions tracked yet.</p>}
            </div>
          </article>
        </section>

        <section
          id="panel-assistant-turns"
          role="tabpanel"
          aria-labelledby="tab-assistant-turns"
          hidden={displayedTabId !== "assistant-turns"}
          className="admins-ols-card"
        >
          <div className="admins-ols-card-head">
            <h2>Recent Assistant Turns</h2>
            <span className="admins-ols-pill">{recentAssistantMessages.length} turns</span>
          </div>
          <div className="admins-ols-stack">
            {recentAssistantMessages.map((item) => (
              <article key={`${item.sessionId}-${item.messageId}`} className="admins-ols-log">
                <div className="admins-ols-log-meta">
                  <span
                    className={`admins-ols-badge is-${
                      ["fallback", "needs_attention"].includes(String(item.metadata.responseMode || "").trim().toLowerCase())
                        ? "negative"
                        : "neutral"
                    }`}
                  >
                    {titleCase(item.metadata.responseMode || "live")}
                  </span>
                  <small>{formatDateTime(item.createdAt)}</small>
                </div>
                <p>{truncate(item.content, 320)}</p>
                <small>
                  {getAssistantTurnSourceLabel(item)} | {item.metadata.city || "Unknown city"} |{" "}
                  {item.metadata.pageType || "Unknown page"}
                </small>
              </article>
            ))}
            {!recentAssistantMessages.length && <p className="admins-ols-empty">No assistant turns found yet.</p>}
          </div>
        </section>

        <section
          id="panel-account"
          role="tabpanel"
          aria-labelledby="tab-account"
          hidden={displayedTabId !== "account"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Account Settings</h2>
              <span className="admins-ols-pill">
                {isSharedKeySession ? "Shared Key Session" : "Supabase Auth"}
              </span>
            </div>
            <p className="admins-ols-copy">
              Update your admin profile details and password from this tab.
            </p>
            <form className="admins-ols-form" onSubmit={handleSaveAccount}>
              <label>
                Full name
                <input
                  type="text"
                  value={accountForm.fullName}
                  onChange={handleAccountFieldChange("fullName")}
                  placeholder="Your full name"
                  disabled={savingAccount || isSharedKeySession}
                  autoComplete="name"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={currentAdmin?.email || ""}
                  disabled
                  readOnly
                  autoComplete="email"
                />
              </label>
              <label>
                Current password
                <input
                  type="password"
                  value={accountForm.currentPassword}
                  onChange={handleAccountFieldChange("currentPassword")}
                  placeholder="Required to change password"
                  disabled={savingAccount || isSharedKeySession}
                  autoComplete="current-password"
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={accountForm.newPassword}
                  onChange={handleAccountFieldChange("newPassword")}
                  placeholder="At least 8 characters"
                  disabled={savingAccount || isSharedKeySession}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={accountForm.confirmPassword}
                  onChange={handleAccountFieldChange("confirmPassword")}
                  placeholder="Re-enter new password"
                  disabled={savingAccount || isSharedKeySession}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" disabled={savingAccount || isSharedKeySession}>
                {savingAccount ? "Saving account..." : "Save Account Changes"}
              </button>
            </form>
          </article>

          <article className="admins-ols-card admins-ols-stat">
            <span>Security Notes</span>
            <strong>{isSharedKeySession ? "Limited Mode" : "Full Account Access"}</strong>
            <small>
              {isSharedKeySession
                ? "Shared key sessions cannot update profile or password. Sign in with email/password to manage your account."
                : "Password changes require your current password and are applied to your Supabase admin account immediately."}
            </small>
            <small>
              Last dashboard sync: {dashboard?.generatedAt ? formatDateTime(dashboard.generatedAt) : "Unknown"}
            </small>
          </article>

          {isSuperAdmin && (
            <article className="admins-ols-card">
              <div className="admins-ols-card-head">
                <h2>Invite Admin</h2>
                <span className="admins-ols-pill">Superadmin</span>
              </div>
              <p className="admins-ols-copy">
                Send an email invitation to a new admin. They will set their own password from the invite link, then
                sign in on <Link className="admins-ols-inline-link" to="/admins-ols/login">/admins-ols/login</Link>.
              </p>
              <p className="admins-ols-note" style={{ marginTop: 0 }}>
                Invite redirect target: <strong>{system?.siteUrl || (typeof window !== "undefined" ? window.location.origin : "")}</strong>
              </p>
              <form className="admins-ols-form" onSubmit={handleSendInvite}>
                <label>
                  Admin email
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={handleInviteFieldChange("email")}
                    placeholder="newadmin@oneluxstay.com"
                    autoComplete="email"
                    required
                    disabled={sendingInvite}
                  />
                </label>
                <label>
                  Full name (first + last)
                  <input
                    type="text"
                    value={inviteForm.fullName}
                    onChange={handleInviteFieldChange("fullName")}
                    placeholder="First name Last name"
                    autoComplete="name"
                    required
                    disabled={sendingInvite}
                  />
                </label>
                <label>
                  Role
                  <select value={inviteForm.role} onChange={handleInviteFieldChange("role")} disabled={sendingInvite}>
                    <option value="admins_ols">Admin</option>
                    <option value="admins_ols_superadmin">Superadmin</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(inviteForm.forceResend)}
                    onChange={handleInviteFieldChange("forceResend")}
                    disabled={sendingInvite}
                  />
                  Resend invite even if already invited recently
                </label>
                <button type="submit" disabled={sendingInvite}>
                  {sendingInvite ? "Sending invite..." : "Send Invite"}
                </button>
              </form>
              {lastInviteLink && (
                <div className="admins-ols-form" style={{ marginTop: "1rem" }}>
                  <label>
                    Manual invite link
                    <input type="text" value={lastInviteLink} readOnly />
                  </label>
                  <button
                    type="button"
                    className="is-secondary"
                    onClick={async () => {
                      try {
                        await window.navigator?.clipboard?.writeText?.(lastInviteLink);
                        setNotice("Invite link copied to clipboard.");
                      } catch {
                        setNotice("Unable to copy automatically. Select the link and copy it manually.");
                      }
                    }}
                  >
                    Copy Invite Link
                  </button>
                </div>
              )}
            </article>
          )}
        </section>
            </div>
          </main>
        </div>
      </div>
    </div>
    {isConversationSummaryModalOpen && selectedConversation && (
      <div
        className="admins-ols-modal-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            handleCloseConversationSummaryModal();
          }
        }}
      >
        <div
          className="admins-ols-modal admins-ols-modal--summary"
          role="dialog"
          aria-modal="true"
          aria-label="Conversation summary"
        >
          <div className="admins-ols-modal-head">
            <div className="admins-ols-modal-head-left">
              <span className="admins-ols-badge is-active">Summary</span>
              <div className="admins-ols-modal-title">
                <strong>{getConversationTitle(selectedConversation)}</strong>
                <small>
                  {formatPageLabel(selectedConversation.pageType)}{" "}
                  {selectedConversation.city && selectedConversation.city.toLowerCase() !== "unknown city"
                    ? `| ${selectedConversation.city}`
                    : ""}
                  {selectedConversation.listingId ? ` | Listing ${shortenId(selectedConversation.listingId)}` : ""}
                </small>
              </div>
            </div>
            <div className="admins-ols-modal-actions">
              <button
                type="button"
                className="admins-ols-modal-btn is-secondary"
                onClick={() => handleGenerateConversationSummary({ forceRefresh: true })}
                disabled={conversationSummaryLoading}
                title="Regenerate summary"
              >
                {conversationSummaryLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                className="admins-ols-modal-btn is-primary"
                onClick={handleCloseConversationSummaryModal}
                ref={conversationSummaryCloseButtonRef}
              >
                Close
              </button>
            </div>
          </div>
          <div className="admins-ols-modal-body">
            {conversationSummaryLoading && (
              <div className="admins-ols-banner">Preparing a quick conversation summary for you...</div>
            )}
            {!conversationSummaryLoading && conversationSummaryError && (
              <div className="admins-ols-error">Conversation summary unavailable: {conversationSummaryError}</div>
            )}
            {!conversationSummaryLoading &&
              !conversationSummaryError &&
              conversationSummary &&
              conversationSummary.sessionId === selectedConversation.sessionId && (
                <>
                  <div className="admins-ols-modal-meta">
                    <small>
                      {conversationSummary.generatedAt
                        ? `Generated ${formatDateTime(conversationSummary.generatedAt)}`
                        : "Generated now"}
                    </small>
                  </div>
                  {(() => {
                    const parsed = parseAdminConversationSummary(conversationSummary.text);
                    return (
                      <div className="admins-ols-summary-single">
                        <div className="admins-ols-summary-section">
                          <span className="admins-ols-summary-label">TL;DR</span>
                          <p className="admins-ols-summary-value">{parsed.tldr || "Conversation summary ready."}</p>
                        </div>
                        <div className="admins-ols-summary-section">
                          <span className="admins-ols-summary-label">Guest Wants</span>
                          <p className="admins-ols-summary-value">{parsed.want || "Help / information"}</p>
                        </div>
                        <div className="admins-ols-summary-section">
                          <span className="admins-ols-summary-label">Next Step</span>
                          <p className="admins-ols-summary-value">
                            {parsed.next || "Ask for the minimum details needed to answer."}
                          </p>
                        </div>
                        <div className="admins-ols-summary-section">
                          <span className="admins-ols-summary-label">Missing (If Any)</span>
                          {parsed.missing.length ? (
                            <div className="admins-ols-summary-chips">
                              {parsed.missing.map((item) => (
                                <span key={item} className="admins-ols-summary-chip">
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="admins-ols-summary-value is-muted">None</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <small className="admins-ols-modal-foot">
                    Saved for this admin session. Other admins can generate their own summary when they open the
                    thread.
                  </small>
                </>
              )}
            {!conversationSummaryLoading &&
              !conversationSummaryError &&
              (!conversationSummary || conversationSummary.sessionId !== selectedConversation.sessionId) && (
                <p className="admins-ols-empty" style={{ margin: 0 }}>
                  Summary not generated yet. Click Refresh to generate one.
                </p>
              )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default AdminsOlsPage;
