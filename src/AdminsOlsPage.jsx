import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useAdminPresence } from "./hooks/useAdminPresence";
import { userHasSuperAdminRole } from "../shared/adminRoles.js";
import { DEFAULT_PROMO_CONFIG, normalizePromoConfig } from "./utils/promoConfig";
import PropertyManager from "./components/admin/PropertyManager";
import "./AdminsOlsPage.css";

const DASHBOARD_ACTIVITY_DEDUPE_KEY = "admins-ols-dashboard-opened";
const DASHBOARD_ACTIVITY_DEDUPE_WINDOW_MS = 5000;
const TAB_TRANSITION_MS = 180;
const ATTENTION_STORAGE_KEY_PREFIX = "admins-ols-attention-seen";
const ATTENTION_NOTIFIED_KEY_PREFIX = "admins-ols-attention-notified";
const TOAST_LIFETIME_MS = 5200;
const CONVERSATION_SUMMARY_SEEN_KEY_PREFIX = "admins-ols-conversation-summary-seen";
const CONVERSATION_SUMMARY_CACHE_PREFIX = "admins-ols-conversation-summary-cache";
const MOBILE_CONVERSATION_BREAKPOINT = 768;
const TABLET_CONVERSATION_BREAKPOINT = 1024;
const MOBILE_CONVERSATION_FILTER_DEFAULT = "all";
const ADMIN_INVITE_ORIGIN = "https://admin.oneluxstay.com";

// Set to true to restore the Call Center sidebar link when the feature is ready
const SHOW_CALL_CENTER = false;

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

const formatConversationListTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";

  const now = new Date();
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  if (sameDay) {
    return parsed.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (parsed.getFullYear() === now.getFullYear()) {
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
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

const getConversationChannelLabel = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim().toLowerCase();
  if (sessionId.startsWith("sms:")) return "SMS";
  if (sessionId.startsWith("whatsapp:") || isWhatsAppConversation(thread)) return "WhatsApp";
  return "Website";
};

const dedupeConversationLabels = (values = []) => {
  const seen = new Set();
  return values.filter((value) => {
    const label = String(value || "").trim();
    if (!label) return false;
    const normalized = label.toLowerCase();
    const key = normalized.includes("whatsapp") ? "whatsapp" : normalized;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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

const normalizeConversationMode = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["ai", "human", "paused", "closed"].includes(normalized)) return normalized;
  return "ai";
};

const getConversationAssigneeLabel = (thread = {}) => {
  const name = String(thread?.assignedAdminName || "").trim();
  if (name) return name;
  return "OneLuxStay team";
};

const getConversationModeBadge = (thread = {}) => {
  const mode = normalizeConversationMode(thread?.conversationMode);
  if (mode === "human") {
    return { label: `${getConversationAssigneeLabel(thread)} handling`, tone: "active" };
  }
  if (mode === "paused") {
    return { label: "AI paused", tone: "negative" };
  }
  if (mode === "closed") {
    return { label: "Conversation closed", tone: "inactive" };
  }
  return { label: "AI Active", tone: "positive" };
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
    conversationMode: normalizeConversationMode(threadMeta.conversationMode),
    assignedAdminId: String(threadMeta.assignedAdminId || "").trim(),
    assignedAdminName: String(threadMeta.assignedAdminName || "").trim(),
    humanTakenOverAt: String(threadMeta.humanTakenOverAt || "").trim(),
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
      conversationMode: normalizeConversationMode(threadMeta.conversationMode || thread.conversationMode),
      assignedAdminId: String(threadMeta.assignedAdminId || thread.assignedAdminId || "").trim(),
      assignedAdminName: String(threadMeta.assignedAdminName || thread.assignedAdminName || "").trim(),
      humanTakenOverAt: String(threadMeta.humanTakenOverAt || thread.humanTakenOverAt || "").trim(),
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

const updateConversationModeInDashboard = (dashboard, sessionId = "", patch = {}) => {
  const targetSessionId = String(sessionId || "").trim();
  if (!dashboard || !targetSessionId) return dashboard;
  const existingThreads = Array.isArray(dashboard.recentConversations)
    ? dashboard.recentConversations
    : [];
  const nextThreads = existingThreads.map((thread) => {
    if (String(thread?.sessionId || "").trim() !== targetSessionId) return thread;
    return {
      ...thread,
      conversationMode: normalizeConversationMode(patch?.conversationMode || thread?.conversationMode),
      assignedAdminId: String(patch?.assignedAdminId || "").trim(),
      assignedAdminName: String(patch?.assignedAdminName || "").trim(),
      humanTakenOverAt: String(patch?.humanTakenOverAt || thread?.humanTakenOverAt || "").trim(),
    };
  });
  return {
    ...dashboard,
    recentConversations: nextThreads,
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
  const location = useLocation();
  const navigate = useNavigate();
  const { conversationId: routeConversationIdParam = "" } = useParams();
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
  const [conversationSearchInput, setConversationSearchInput] = useState("");
  const [mobileConversationFilter, setMobileConversationFilter] = useState(MOBILE_CONVERSATION_FILTER_DEFAULT);
  const [desktopConversationFilter, setDesktopConversationFilter] = useState("all");
  const [desktopConversationSearch, setDesktopConversationSearch] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [conversationModeUpdating, setConversationModeUpdating] = useState(false);
  const [conversationSummary, setConversationSummary] = useState(null);
  const [conversationSummaryLoading, setConversationSummaryLoading] = useState(false);
  const [conversationSummaryError, setConversationSummaryError] = useState("");
  const [isConversationSummaryModalOpen, setIsConversationSummaryModalOpen] = useState(false);
  const [isMobileConversationInfoOpen, setIsMobileConversationInfoOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(() => ({
    fullName: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  }));
  const [savingAccount, setSavingAccount] = useState(false);
  const [promoConfig, setPromoConfig] = useState(DEFAULT_PROMO_CONFIG);
  const [savingPromos, setSavingPromos] = useState(false);
  const [promoNotice, setPromoNotice] = useState("");
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
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : TABLET_CONVERSATION_BREAKPOINT + 1,
  );
  const [attentionSeenSignatures, setAttentionSeenSignatures] = useState([]);
  const threadScrollRef = useRef(null);
  const detailsDropdownRef = useRef(null);
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
  const isSuperAdmin = userHasSuperAdminRole(currentAdmin);
  const adminPresencePath = useMemo(
    () => `${location.pathname || "/"}${location.search || ""}`,
    [location.pathname, location.search],
  );

  useAdminPresence({
    session,
    enabled: Boolean(session?.accessToken),
    currentPath: adminPresencePath,
  });

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return;
    fetch(`${apiBase}/promo-config`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.promos) setPromoConfig(normalizePromoConfig(payload.promos));
      })
      .catch(() => {});
  }, [session?.accessToken, session?.sharedKey]);

  const handleSavePromos = async (event) => {
    event.preventDefault();
    setSavingPromos(true);
    setPromoNotice("");
    try {
      const response = await fetch(`${apiBase}/promo-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAdminsOlsAuthHeaders(session),
        },
        body: JSON.stringify({ promos: promoConfig }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save promos");
      setPromoConfig(normalizePromoConfig(payload.promos));
      setPromoNotice("Promo discounts saved and published.");
    } catch (saveError) {
      setPromoNotice(saveError?.message || "Unable to save promo discounts.");
    } finally {
      setSavingPromos(false);
    }
  };

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
  const unreadAttentionSignatureSet = useMemo(
    () => new Set(unreadAttentionThreads.map((thread) => getConversationAttentionSignature(thread)).filter(Boolean)),
    [unreadAttentionThreads],
  );
  const isMobileInboxViewport = viewportWidth < MOBILE_CONVERSATION_BREAKPOINT;
  const isTabletInboxViewport =
    viewportWidth >= MOBILE_CONVERSATION_BREAKPOINT && viewportWidth <= TABLET_CONVERSATION_BREAKPOINT;
  const shouldUseMobileConversationCards = isMobileInboxViewport || isTabletInboxViewport;
  const routeConversationId = useMemo(() => {
    try {
      return decodeURIComponent(String(routeConversationIdParam || "").trim());
    } catch {
      return String(routeConversationIdParam || "").trim();
    }
  }, [routeConversationIdParam]);
  const pathname = String(location.pathname || "");
  const isMobileConversationsRoute = isMobileInboxViewport && /^\/executive-ols\/conversations\/?$/.test(pathname);
  const isMobileChatRoute = isMobileInboxViewport && /^\/executive-ols\/chat\/[^/]+/.test(location.pathname || "");
  const isMobileMessagingRoute = isMobileConversationsRoute || isMobileChatRoute;
  const normalizedConversationSearch = String(conversationSearchInput || "").trim().toLowerCase();
  const selectedConversation =
    recentConversations.find((thread) => thread.sessionId === selectedConversationSessionId) ||
    recentConversations[0] ||
    null;
  const mobileSelectedConversation =
    recentConversations.find((thread) => thread.sessionId === routeConversationId) || null;
  const activeConversation = isMobileInboxViewport
    ? isMobileChatRoute
      ? mobileSelectedConversation
      : null
    : selectedConversation;
  const activeConversationMode = normalizeConversationMode(activeConversation?.conversationMode);
  const activeConversationModeBadge = getConversationModeBadge(activeConversation || {});
  const isActiveConversationAi = activeConversationMode === "ai";
  const isActiveConversationHuman = activeConversationMode === "human";
  const isActiveConversationPaused = activeConversationMode === "paused";
  const lastGuestMessagePreview = activeConversation?.messages?.length
    ? [...activeConversation.messages].reverse().find((m) => m.role === "user")?.content || ""
    : "";
  const isMobileThreadOpen = isMobileChatRoute && Boolean(activeConversation?.sessionId);
  const shouldRenderConversationList = !isMobileInboxViewport || !isMobileChatRoute;
  const shouldRenderConversationThread = !isMobileInboxViewport || isMobileChatRoute;
  const visibleConversationThreads = useMemo(() => {
    if (!isMobileConversationsRoute) return recentConversations;

    const matchesQuery = (thread) => {
      if (!normalizedConversationSearch) return true;
      const haystack = [
        getConversationTitle(thread),
        getConversationPreview(thread),
        getConversationChannelLabel(thread),
        thread?.city,
        thread?.listingId,
        thread?.sessionId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedConversationSearch);
    };

    return recentConversations.filter((thread) => {
      const signature = getConversationAttentionSignature(thread);
      const isUnread = Boolean(signature && unreadAttentionSignatureSet.has(signature));
      const needsAttention = conversationNeedsAttention(thread);
      const matchesFilter =
        mobileConversationFilter === "all" ||
        (mobileConversationFilter === "unread" && isUnread) ||
        (mobileConversationFilter === "attention" && needsAttention);

      return matchesFilter && matchesQuery(thread);
    });
  }, [
    isMobileConversationsRoute,
    mobileConversationFilter,
    normalizedConversationSearch,
    recentConversations,
    unreadAttentionSignatureSet,
  ]);
  const mobileConversationFilterCounts = useMemo(
    () => ({
      all: recentConversations.length,
      unread: recentConversations.filter((thread) => {
        const signature = getConversationAttentionSignature(thread);
        return Boolean(signature && unreadAttentionSignatureSet.has(signature));
      }).length,
      attention: attentionThreads.length,
    }),
    [attentionThreads.length, recentConversations, unreadAttentionSignatureSet],
  );

  const normalizedDesktopSearch = String(desktopConversationSearch || "").trim().toLowerCase();
  const desktopFilteredConversations = useMemo(() => {
    const matchesQuery = (thread) => {
      if (!normalizedDesktopSearch) return true;
      const haystack = [
        getConversationTitle(thread),
        getConversationPreview(thread),
        getConversationChannelLabel(thread),
        thread?.city,
        thread?.listingId,
        thread?.sessionId,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedDesktopSearch);
    };
    return recentConversations.filter((thread) => {
      const matchesFilter =
        desktopConversationFilter === "all" ||
        (desktopConversationFilter === "ai" && normalizeConversationMode(thread.conversationMode) === "ai") ||
        (desktopConversationFilter === "human" && normalizeConversationMode(thread.conversationMode) === "human") ||
        (desktopConversationFilter === "paused" && normalizeConversationMode(thread.conversationMode) === "paused") ||
        (desktopConversationFilter === "attention" && conversationNeedsAttention(thread));
      return matchesFilter && matchesQuery(thread);
    });
  }, [desktopConversationFilter, normalizedDesktopSearch, recentConversations]);

  const desktopFilterCounts = useMemo(() => ({
    all: recentConversations.length,
    ai: recentConversations.filter((t) => normalizeConversationMode(t.conversationMode) === "ai").length,
    human: recentConversations.filter((t) => normalizeConversationMode(t.conversationMode) === "human").length,
    paused: recentConversations.filter((t) => normalizeConversationMode(t.conversationMode) === "paused").length,
    attention: attentionThreads.length,
  }), [attentionThreads.length, recentConversations]);

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
    if (!activeConversation?.sessionId) return null;
    return loadCachedConversationSummary(activeConversation.sessionId);
  }, [activeConversation?.sessionId, conversationSummaryCacheKey]);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleViewportResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleViewportResize();
    window.addEventListener("resize", handleViewportResize);
    window.addEventListener("orientationchange", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("orientationchange", handleViewportResize);
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
    if (!isMobileInboxViewport) return;
    if (isMobileMessagingRoute && activeTabId !== "conversations") {
      setActiveTabId("conversations");
    }
  }, [activeTabId, isMobileInboxViewport, isMobileMessagingRoute]);

  useEffect(() => {
    if (!isMobileConversationsRoute) {
      setConversationSearchInput("");
      setMobileConversationFilter(MOBILE_CONVERSATION_FILTER_DEFAULT);
    }
  }, [isMobileConversationsRoute]);

  useEffect(() => {
    if (!isMobileChatRoute || !routeConversationId) {
      return;
    }
    const hasRouteConversation = recentConversations.some((thread) => thread.sessionId === routeConversationId);
    if (hasRouteConversation) {
      setSelectedConversationSessionId(routeConversationId);
    }
  }, [isMobileChatRoute, recentConversations, routeConversationId]);

  useEffect(() => {
    if (isMobileInboxViewport) return;
    if (!/^\/executive-ols\/(conversations\/?|chat\/[^/]+)/.test(pathname)) return;
    navigate("/executive-ols", { replace: true });
  }, [isMobileInboxViewport, navigate, pathname]);

  useEffect(() => {
    if (!isMobileThreadOpen) {
      setIsMobileConversationInfoOpen(false);
    }
  }, [activeConversation?.sessionId, isMobileThreadOpen]);

  useEffect(() => {
    if (!threadScrollRef.current) return;
    threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
  }, [activeConversation?.sessionId, activeConversation?.messageCount, isMobileThreadOpen]);

  useEffect(() => {
    setReplyDraft("");
  }, [activeConversation?.sessionId]);

  useEffect(() => {
    setIsDetailsOpen(false);
  }, [activeConversation?.sessionId]);

  useEffect(() => {
    if (!isDetailsOpen) return;
    const handleOutsideClick = (event) => {
      if (detailsDropdownRef.current && !detailsDropdownRef.current.contains(event.target)) {
        setIsDetailsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isDetailsOpen]);

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
          if (window.innerWidth < MOBILE_CONVERSATION_BREAKPOINT) {
            navigate(`/executive-ols/chat/${encodeURIComponent(newestThread.sessionId)}`);
          }
          notification.close();
        };
      } catch {
        // Ignore notification failures.
      }
    };

    void playAlertTone();
    showBrowserNotification();
  }, [attentionNotifiedStorageKey, attentionThreads, navigate]);

  useEffect(() => {
    if (displayedTabId !== "conversations" || !activeConversation?.sessionId) return;
    if (!conversationNeedsAttention(activeConversation)) return;

    const signature = getConversationAttentionSignature(activeConversation);
    if (!signature) return;

    setAttentionSeenSignatures((current) =>
      current.includes(signature) ? current : [...current, signature],
    );
  }, [displayedTabId, activeConversation]);

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
  }, [displayedTabId, activeConversation?.sessionId]);

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
    if (!activeConversation?.sessionId) return;
    if (!session?.accessToken && !session?.sharedKey) return;

    const sessionId = activeConversation.sessionId;

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
      if (!controller.signal.aborted) {
        setConversationSummaryLoading(false);
      }
    }
  };

  const handleOpenConversationSummaryModal = async ({ forceRefresh = false } = {}) => {
    if (!activeConversation?.sessionId) return;
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
  }, [activeConversation?.sessionId]);

  useEffect(() => {
    document.title =
      unreadAttentionCount > 0 ? `(${unreadAttentionCount}) OneLuxStay Admin` : "OneLuxStay Admin";
  }, [unreadAttentionCount]);

  const performAdminRequest = async ({ method = "GET", payload, signal } = {}, sessionOverride = session) => {
    const activeSession = sessionOverride || session;
    if (!activeSession?.accessToken && !activeSession?.sharedKey) {
      throw new Error("Admin session not found.");
    }

    const requestWithTimeout = async (resolvedSession) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort("admins-ols-timeout"), 20_000);
      try {
        return await fetch(`${apiBase}/admins-ols`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...getAdminsOlsAuthHeaders(resolvedSession),
          },
          signal: signal || controller.signal,
          ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    let response = await requestWithTimeout(activeSession);

    if ((response.status === 401 || response.status === 403) && activeSession?.refreshToken) {
      const refreshedSession = await refreshAdminsOlsSession(apiBase, activeSession).catch(() => null);
      if (refreshedSession?.accessToken) {
        setSession(refreshedSession);
        response = await requestWithTimeout(refreshedSession);
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAdminsOlsSession();
        setSession(null);
      }
      if (response.status === 403) {
        throw new Error(data?.error || "Access denied. Your admin permissions may have changed.");
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

  const openConversationThread = (sessionId = "") => {
    const nextSessionId = String(sessionId || "").trim();
    if (!nextSessionId) return;
    setSelectedConversationSessionId(nextSessionId);
    setIsMobileConversationInfoOpen(false);
    if (isMobileInboxViewport) {
      navigate(`/executive-ols/chat/${encodeURIComponent(nextSessionId)}`);
    }
  };

  const closeMobileConversationThread = () => {
    navigate("/executive-ols/conversations");
    setIsMobileConversationInfoOpen(false);
  };

  const handleNavigateToSection = (sectionId = "") => {
    if (!sectionId) return;
    if (isMobileInboxViewport && sectionId === "conversations") {
      navigate("/executive-ols/conversations");
      setIsSidebarOpen(false);
      return;
    }
    setActiveTabId(sectionId);
    setIsSidebarOpen(false);
    if (sectionId !== "conversations") {
      if (isMobileChatRoute) navigate("/executive-ols");
      setIsMobileConversationInfoOpen(false);
    }
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
    if (!activeConversation?.sessionId) return;

    const content = String(replyDraft || "").trim();
    if (!content) return;

    setSendingReply(true);
    setError("");
    setNotice("");

    try {
      const response = await handleAdminAction({
        action: "send_reply",
        sessionId: activeConversation.sessionId,
        content,
        pageContext: {
          pageType: activeConversation.pageType,
          city: activeConversation.city,
          listingId: activeConversation.listingId,
          pathname: activeConversation.pathname,
        },
      });

      if (response?.message?.messageId) {
        setDashboard((current) =>
          injectMessageIntoDashboard(
            current,
            {
              sessionId: activeConversation.sessionId,
              pageType: activeConversation.pageType,
              city: activeConversation.city,
              listingId: activeConversation.listingId,
              pathname: activeConversation.pathname,
              lastSeenAt: activeConversation.lastSeenAt,
              conversationMode: "human",
              assignedAdminId: currentAdmin?.id || "",
              assignedAdminName: currentAdmin?.fullName || currentAdmin?.email || "",
              humanTakenOverAt: new Date().toISOString(),
            },
            response.message,
          ),
        );
      }

      setReplyDraft("");
      setNotice("Reply sent. AI is paused while admin takeover is active.");
      await fetchDashboard(session, { silent: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to send reply."));
    } finally {
      setSendingReply(false);
    }
  };

  const handleConversationModeChange = async (mode = "ai") => {
    if (!activeConversation?.sessionId) return;
    setConversationModeUpdating(true);
    setError("");
    setNotice("");

    const normalizedMode = normalizeConversationMode(mode);
    const action =
      normalizedMode === "human"
        ? "take_over"
        : normalizedMode === "paused"
          ? "pause_ai"
          : normalizedMode === "ai"
            ? "resume_ai"
            : "set_conversation_mode";

    try {
      const response = await handleAdminAction({
        action,
        sessionId: activeConversation.sessionId,
        mode: normalizedMode,
        pageContext: {
          pageType: activeConversation.pageType,
          city: activeConversation.city,
          listingId: activeConversation.listingId,
          pathname: activeConversation.pathname,
        },
      });

      setDashboard((current) =>
        updateConversationModeInDashboard(current, activeConversation.sessionId, {
          conversationMode: response?.conversationMode || normalizedMode,
          assignedAdminId: response?.assignedAdminId || "",
          assignedAdminName: response?.assignedAdminName || "",
          humanTakenOverAt:
            response?.conversationMode === "human" || normalizedMode === "human"
              ? new Date().toISOString()
              : "",
        }),
      );

      if (normalizedMode === "ai") {
        setNotice("AI resumed for this conversation.");
      } else if (normalizedMode === "human") {
        setNotice("Admin takeover enabled. AI is now paused.");
      } else if (normalizedMode === "paused") {
        setNotice("AI paused for this conversation.");
      } else {
        setNotice(`Conversation set to ${normalizedMode} mode.`);
      }

      await fetchDashboard(session, { silent: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to update conversation mode."));
    } finally {
      setConversationModeUpdating(false);
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
      const inferredOrigin = ADMIN_INVITE_ORIGIN;
      const redirectTo = inferredOrigin ? `${inferredOrigin.replace(/\/+$/, "")}/executive-ols/accept` : "";

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
    { id: "properties", label: "Properties" },
    ...(isSuperAdmin ? [{ id: "promos", label: "Promos" }] : []),
    { id: "account", label: "Account" },
  ];

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/executive-ols/login" replace />;
  }

  if (isMobileMessagingRoute) {
    return (
      <div className="admins-ols-page admins-ols-mobile-messaging-page">
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
        <div className="admins-ols-mobile-messaging-app">
          <header className="admins-ols-mobile-messaging-header">
            <button
              type="button"
              className="admins-ols-mobile-messaging-back"
              onClick={() => navigate(isMobileChatRoute ? "/executive-ols/conversations" : "/executive-ols")}
              aria-label={isMobileChatRoute ? "Back to conversations" : "Back to dashboard"}
            >
              ←
            </button>
            <div className="admins-ols-mobile-messaging-head-copy">
              <strong>{isMobileChatRoute ? "Conversation" : "Conversations"}</strong>
              <small>
                {isMobileChatRoute
                  ? activeConversation
                    ? getConversationTitle(activeConversation)
                    : "Thread unavailable"
                  : `${visibleConversationThreads.length} of ${recentConversations.length} chats`}
              </small>
            </div>
            <button
              type="button"
              className="admins-ols-mobile-messaging-refresh"
              onClick={handleManualRefresh}
              disabled={loading}
              aria-label={loading ? "Refreshing conversations" : "Refresh conversations"}
            >
              {loading ? "…" : "↻"}
            </button>
          </header>

          {notice && <div className="admins-ols-banner">{notice}</div>}
          {error && <div className="admins-ols-error">{error}</div>}

          {isMobileConversationsRoute ? (
            <>
              <section className="admins-ols-mobile-inbox-controls" aria-label="Conversation filters">
                <label className="admins-ols-mobile-inbox-search" htmlFor="admins-ols-mobile-conversation-search">
                  <span>Search</span>
                  <input
                    id="admins-ols-mobile-conversation-search"
                    type="search"
                    value={conversationSearchInput}
                    onChange={(event) => setConversationSearchInput(event.target.value)}
                    placeholder="Search guest, city, listing, message..."
                    autoComplete="off"
                  />
                </label>
                <div className="admins-ols-mobile-inbox-filter-row" role="tablist" aria-label="Conversation filter">
                  {[
                    { id: "all", label: "All", count: mobileConversationFilterCounts.all },
                    { id: "unread", label: "Unread", count: mobileConversationFilterCounts.unread },
                    { id: "attention", label: "Needs Attention", count: mobileConversationFilterCounts.attention },
                  ].map((filterItem) => (
                    <button
                      key={filterItem.id}
                      type="button"
                      role="tab"
                      aria-selected={mobileConversationFilter === filterItem.id}
                      className={`admins-ols-mobile-inbox-filter${
                        mobileConversationFilter === filterItem.id ? " is-active" : ""
                      }`}
                      onClick={() => setMobileConversationFilter(filterItem.id)}
                    >
                      <span>{filterItem.label}</span>
                      <strong>{filterItem.count}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="admins-ols-mobile-inbox-panel" aria-label="Conversation inbox">
                <div className="admins-ols-messenger is-mobile-inbox is-mobile-list-open admins-ols-mobile-fullscreen-messenger">
                  <div
                    className="admins-ols-messenger-list admins-ols-mobile-inbox-shell"
                    role="list"
                    aria-label="Recent conversation sessions"
                  >
                    {visibleConversationThreads.map((thread) => {
                      const latestMessage = thread.messages?.[thread.messages.length - 1] || null;
                      const isActive = thread.sessionId === activeConversation?.sessionId;
                      const needsAttention = conversationNeedsAttention(thread);
                      const unreadBadge = unreadAttentionSignatureSet.has(getConversationAttentionSignature(thread));
                      const modeBadge = getConversationModeBadge(thread);
                      const conversationContextLabels = dedupeConversationLabels([
                        getConversationChannelLabel(thread),
                        formatPageLabel(thread.pageType),
                        isWhatsAppConversation(thread)
                          ? getWhatsAppPhoneLabel(thread) || "WhatsApp guest"
                          : thread.listingId
                            ? `Listing ${shortenId(thread.listingId)}`
                            : thread.city && thread.city.toLowerCase() !== "unknown city"
                              ? thread.city
                              : "",
                      ]);

                      return (
                        <button
                          key={thread.sessionId}
                          type="button"
                          className={`admins-ols-messenger-item${isActive ? " is-active" : ""}`}
                          onClick={() => openConversationThread(thread.sessionId)}
                        >
                          <div className="admins-ols-messenger-item-avatar">{getConversationInitial(thread)}</div>
                          <div className="admins-ols-messenger-item-body">
                            <div className="admins-ols-messenger-item-mobile-header">
                              <h3 className="admins-ols-messenger-item-mobile-title">{getConversationTitle(thread)}</h3>
                              <div className="admins-ols-messenger-item-mobile-timegroup">
                                <span className="admins-ols-messenger-item-mobile-time">
                                  {formatConversationListTime(thread.lastSeenAt)}
                                </span>
                              </div>
                            </div>
                            <p className="admins-ols-messenger-item-mobile-preview">{getConversationPreview(thread)}</p>
                            <div className="admins-ols-messenger-item-mobile-tags">
                              {conversationContextLabels.slice(0, 3).map((label) => (
                                <span key={`${thread.sessionId}-${label}`} className="admins-ols-messenger-item-mobile-badge">
                                  {label}
                                </span>
                              ))}
                            </div>
                            <div className="admins-ols-messenger-item-mobile-footer">
                              <div className="admins-ols-messenger-item-mobile-counts">
                                <span className="admins-ols-messenger-item-mobile-count-pill">
                                  {thread.messageCount} messages
                                </span>
                                {latestMessage?.cardCount > 0 && (
                                  <span className="admins-ols-messenger-item-mobile-count-pill">
                                    {latestMessage.cardCount} cards
                                  </span>
                                )}
                              </div>
                              <div className="admins-ols-messenger-item-mobile-status">
                                <span className={`admins-ols-badge is-${modeBadge.tone}`}>{modeBadge.label}</span>
                                {needsAttention && <span className="admins-ols-badge is-negative">Needs attention</span>}
                                {unreadBadge && <span className="admins-ols-messenger-item-unread">1</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {!visibleConversationThreads.length && (
                      <p className="admins-ols-empty">No conversations matched your filters.</p>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="admins-ols-mobile-chat-panel" aria-label="Conversation thread">
              <div className="admins-ols-messenger is-mobile-inbox is-mobile-thread-open admins-ols-mobile-fullscreen-messenger">
                <div className="admins-ols-messenger-thread admins-ols-mobile-chat-shell">
                  {activeConversation ? (
                    <>
                      {conversationNeedsAttention(activeConversation) && (
                        <div className="admins-ols-conversation-alert">
                          <span className="admins-ols-badge is-negative">Needs attention</span>
                          <p>The concierge paused this thread because it started repeating or could not answer clearly.</p>
                        </div>
                      )}
                      <div className="admins-ols-conversation-head">
                        <div className="admins-ols-mobile-thread-nav">
                          <button
                            type="button"
                            className="admins-ols-mobile-back-btn"
                            onClick={closeMobileConversationThread}
                            aria-label="Back to conversation list"
                          >
                            ←
                          </button>
                          <div className="admins-ols-mobile-thread-nav-main">
                            <h3 className="admins-ols-conversation-title">{getConversationTitle(activeConversation)}</h3>
                            <p className="admins-ols-mobile-thread-nav-subtitle">
                              {getConversationChannelLabel(activeConversation)}
                              {" • "}
                              {isWhatsAppConversation(activeConversation)
                                ? getWhatsAppPhoneLabel(activeConversation) || "WhatsApp guest"
                                : activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                                  ? activeConversation.city
                                  : "Website"}
                            </p>
                            <p className="admins-ols-mobile-thread-nav-subtitle">
                              {activeConversationModeBadge.label}
                            </p>
                          </div>
                          <div className="admins-ols-mobile-thread-nav-actions">
                            <button
                              type="button"
                              className="admins-ols-mobile-head-action"
                              onClick={() => setIsMobileConversationInfoOpen((current) => !current)}
                              aria-label={isMobileConversationInfoOpen ? "Hide conversation info" : "Show conversation info"}
                              aria-expanded={isMobileConversationInfoOpen}
                              aria-controls="admins-ols-mobile-conversation-info"
                            >
                              Info
                            </button>
                            <button
                              type="button"
                              className="admins-ols-mobile-head-action"
                              onClick={() => handleConversationModeChange(isActiveConversationAi ? "human" : "ai")}
                              disabled={conversationModeUpdating}
                              aria-label={isActiveConversationAi ? "Take over conversation" : "Resume AI"}
                              title={isActiveConversationAi ? "Take over conversation" : "Resume AI"}
                            >
                              {conversationModeUpdating ? "..." : isActiveConversationAi ? "Take Over" : "Resume"}
                            </button>
                            <button
                              type="button"
                              className="admins-ols-mobile-head-action admins-ols-mobile-head-action--summary"
                              onClick={() =>
                                handleOpenConversationSummaryModal({
                                  forceRefresh: false,
                                })
                              }
                              disabled={conversationSummaryLoading}
                              title="Generate a quick admin summary for this thread"
                              aria-label="Conversation summary"
                            >
                              {conversationSummaryLoading ? "..." : "AI"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {isMobileConversationInfoOpen && (
                        <div id="admins-ols-mobile-conversation-info" className="admins-ols-mobile-conversation-info">
                          <span>{formatPageLabel(activeConversation.pageType)}</span>
                          <span>{activeConversation.messageCount} messages</span>
                          <span>{formatDateTime(activeConversation.lastSeenAt)}</span>
                          {dedupeConversationLabels([
                            getConversationChannelLabel(activeConversation),
                            isWhatsAppConversation(activeConversation)
                              ? getWhatsAppPhoneLabel(activeConversation) || "WhatsApp guest"
                              : activeConversation.listingId
                                ? `Listing ${shortenId(activeConversation.listingId)}`
                                : activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                                  ? activeConversation.city
                                  : "",
                          ]).map((label) => (
                            <span key={`${activeConversation.sessionId}-mobile-info-${label}`}>{label}</span>
                          ))}
                          {activeConversation.pathname && (
                            <p>{truncate(activeConversation.pathname, 96)}</p>
                          )}
                        </div>
                      )}
                      <div className="admins-ols-thread" ref={threadScrollRef}>
                        {activeConversation.messages.map((message) => (
                          <div
                            key={`${activeConversation.sessionId}-${message.messageId}`}
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
                          {isWhatsAppConversation(activeConversation) ? "Reply to WhatsApp guest" : "Reply as admin"}
                        </label>
                        <div className="admins-ols-thread-composer-tools" aria-hidden="true">
                          <span className="admins-ols-thread-composer-chip">Sender</span>
                          <span className="admins-ols-thread-composer-chip">Attach</span>
                        </div>
                        <div className="admins-ols-thread-composer-row">
                          <button
                            type="button"
                            className="admins-ols-thread-composer-attach"
                            aria-label="Attachment options coming soon"
                            title="Attachment options coming soon"
                            onClick={(event) => event.preventDefault()}
                          >
                            +
                          </button>
                          <textarea
                            id="admins-ols-reply"
                            value={replyDraft}
                            onChange={(event) => setReplyDraft(event.target.value)}
                            placeholder={
                              isWhatsAppConversation(activeConversation)
                                ? "Send a WhatsApp reply as the OneLuxStay team..."
                                : "Reply to this guest conversation as the OneLuxStay team..."
                            }
                            rows={1}
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
                          <button
                            type="submit"
                            className="admins-ols-thread-composer-send"
                            disabled={sendingReply || !replyDraft.trim()}
                          >
                            {sendingReply ? "Sending..." : "Send"}
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="admins-ols-conversation-head">
                        <div className="admins-ols-mobile-thread-nav">
                          <button
                            type="button"
                            className="admins-ols-mobile-back-btn"
                            onClick={closeMobileConversationThread}
                            aria-label="Back to conversation list"
                          >
                            ←
                          </button>
                          <div className="admins-ols-mobile-thread-nav-main">
                            <h3 className="admins-ols-conversation-title">Conversation not available</h3>
                            <p className="admins-ols-mobile-thread-nav-subtitle">
                              This thread was not found or is still loading.
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="admins-ols-empty">Select a conversation to read the thread.</p>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    );
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
                    <Link className="admins-ols-profile-action" to="/executive-ols/audit">
                      <span>Superadmin Audit Log</span>
                      <span className="admins-ols-side-nav-count">{recentAdminActivity.length || "Go"}</span>
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link className="admins-ols-profile-action" to="/executive-ols/guest-journeys">
                      <span>Guest Journey Log</span>
                      <span className="admins-ols-side-nav-count">{recentGuestJourneyEvents.length || "Go"}</span>
                    </Link>
                  )}
                  {SHOW_CALL_CENTER && (
                    <Link className="admins-ols-profile-action" to="/executive-ols/calls">
                      <span>Call Center</span>
                      <span className="admins-ols-side-nav-count">View</span>
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link className="admins-ols-profile-action" to="/executive-ols/admin-presence">
                      <span>Live Admins</span>
                      <span className="admins-ols-side-nav-count">{recentSessions.length || "Go"}</span>
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
                <p className="admins-ols-eyebrow">OneLuxStay Executive</p>
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
          className={`admins-ols-card admins-ols-conversations-panel${
            isMobileInboxViewport ? " is-mobile-view" : ""
          }${isTabletInboxViewport ? " is-tablet-view" : ""}${
            isMobileInboxViewport && isMobileChatRoute ? " is-mobile-thread-open" : ""
          }`}
        >
          <div className="admins-ols-card-head">
            <h2>{isMobileInboxViewport ? (isMobileChatRoute ? "Conversation" : "Inbox") : "Recent Conversations"}</h2>
            <span className="admins-ols-pill">
              {isMobileInboxViewport ? `${recentConversations.length} chats` : `${recentConversations.length} sessions`}
            </span>
          </div>
          <div
            className={`admins-ols-messenger${isMobileInboxViewport ? " is-mobile-inbox" : ""}${
              isTabletInboxViewport ? " is-tablet-inbox" : ""
            }${isMobileInboxViewport && isMobileChatRoute ? " is-mobile-thread-open" : " is-mobile-list-open"}`}
          >
            {shouldRenderConversationList && (
              <div
                className={`admins-ols-messenger-list${isMobileInboxViewport ? " admins-ols-mobile-inbox-shell" : ""}`}
                role="list"
                aria-label="Recent conversation sessions"
              >
              {!isMobileInboxViewport && (
                <div className="admins-ols-desktop-sidebar-controls">
                  <div className="admins-ols-desktop-sidebar-search-wrap">
                    <svg className="admins-ols-desktop-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M12.5 12.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="search"
                      className="admins-ols-desktop-search-input"
                      value={desktopConversationSearch}
                      onChange={(e) => setDesktopConversationSearch(e.target.value)}
                      placeholder="Search conversations…"
                      autoComplete="off"
                    />
                    {desktopConversationSearch && (
                      <button
                        type="button"
                        className="admins-ols-desktop-search-clear"
                        onClick={() => setDesktopConversationSearch("")}
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="admins-ols-desktop-filter-row" role="tablist" aria-label="Filter conversations">
                    {[
                      { id: "all", label: "All", count: desktopFilterCounts.all },
                      { id: "ai", label: "AI", count: desktopFilterCounts.ai },
                      { id: "human", label: "Human", count: desktopFilterCounts.human },
                      { id: "paused", label: "Paused", count: desktopFilterCounts.paused },
                      { id: "attention", label: "Attn", count: desktopFilterCounts.attention },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={desktopConversationFilter === f.id}
                        className={`admins-ols-desktop-filter-btn${desktopConversationFilter === f.id ? " is-active" : ""}${f.id === "attention" && f.count > 0 ? " is-attention" : ""}`}
                        onClick={() => setDesktopConversationFilter(f.id)}
                      >
                        {f.label}
                        {f.count > 0 && <span className="admins-ols-desktop-filter-count">{f.count}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {desktopFilteredConversations.map((thread) => {
                const latestMessage = thread.messages?.[thread.messages.length - 1] || null;
                const isActive = thread.sessionId === activeConversation?.sessionId;
                const needsAttention = conversationNeedsAttention(thread);
                const unreadBadge = unreadAttentionSignatureSet.has(getConversationAttentionSignature(thread));
                const modeBadge = getConversationModeBadge(thread);
                const conversationContextLabels = dedupeConversationLabels([
                  getConversationChannelLabel(thread),
                  formatPageLabel(thread.pageType),
                  isWhatsAppConversation(thread)
                    ? getWhatsAppPhoneLabel(thread) || "WhatsApp guest"
                    : thread.listingId
                      ? `Listing ${shortenId(thread.listingId)}`
                      : thread.city && thread.city.toLowerCase() !== "unknown city"
                        ? thread.city
                        : "",
                ]);

                return (
                  <button
                    key={thread.sessionId}
                    type="button"
                    className={`admins-ols-messenger-item${isActive ? " is-active" : ""}`}
                    onClick={() => openConversationThread(thread.sessionId)}
                  >
                    <div className="admins-ols-messenger-item-avatar">{getConversationInitial(thread)}</div>
                    <div className="admins-ols-messenger-item-body">
                      {isMobileInboxViewport ? (
                        <>
                          <div className="admins-ols-messenger-item-mobile-header">
                            <h3 className="admins-ols-messenger-item-mobile-title">{getConversationTitle(thread)}</h3>
                            <div className="admins-ols-messenger-item-mobile-timegroup">
                              <span className="admins-ols-messenger-item-mobile-time">
                                {formatConversationListTime(thread.lastSeenAt)}
                              </span>
                            </div>
                          </div>
                          <p className="admins-ols-messenger-item-mobile-preview">{getConversationPreview(thread)}</p>
                          <div className="admins-ols-messenger-item-mobile-tags">
                            {conversationContextLabels.slice(0, 3).map((label) => (
                              <span key={`${thread.sessionId}-${label}`} className="admins-ols-messenger-item-mobile-badge">
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="admins-ols-messenger-item-mobile-footer">
                            <div className="admins-ols-messenger-item-mobile-counts">
                              <span className="admins-ols-messenger-item-mobile-count-pill">
                                {thread.messageCount} messages
                              </span>
                              {latestMessage?.cardCount > 0 && (
                                <span className="admins-ols-messenger-item-mobile-count-pill">
                                  {latestMessage.cardCount} cards
                                </span>
                              )}
                            </div>
                            <div className="admins-ols-messenger-item-mobile-status">
                              {needsAttention && <span className="admins-ols-badge is-negative">Needs attention</span>}
                              {unreadBadge && <span className="admins-ols-messenger-item-unread">1</span>}
                            </div>
                          </div>
                        </>
                      ) : shouldUseMobileConversationCards ? (
                        <>
                          <div className="admins-ols-messenger-item-mobile-top-row">
                            <h3 className="admins-ols-messenger-item-mobile-title">{getConversationTitle(thread)}</h3>
                            <div className="admins-ols-messenger-item-mobile-timegroup">
                              <span className="admins-ols-messenger-item-mobile-time">
                                {formatConversationListTime(thread.lastSeenAt)}
                              </span>
                              {unreadBadge && <span className="admins-ols-messenger-item-unread">1</span>}
                            </div>
                          </div>
                          <p className="admins-ols-messenger-item-mobile-preview">{getConversationPreview(thread)}</p>
                          <div className="admins-ols-messenger-item-mobile-badges">
                            {conversationContextLabels.slice(0, 3).map((label) => (
                              <span key={`${thread.sessionId}-${label}`} className="admins-ols-messenger-item-mobile-badge">
                                {label}
                              </span>
                            ))}
                            <span className="admins-ols-messenger-item-mobile-badge">{thread.messageCount} messages</span>
                            {latestMessage?.cardCount > 0 && (
                              <span className="admins-ols-messenger-item-mobile-badge">{latestMessage.cardCount} cards</span>
                            )}
                            <span className={`admins-ols-badge is-${modeBadge.tone}`}>{modeBadge.label}</span>
                            {needsAttention && <span className="admins-ols-badge is-negative">Needs attention</span>}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="admins-ols-messenger-item-top">
                            <strong>{getConversationTitle(thread)}</strong>
                            <div className="admins-ols-messenger-item-timegroup">
                              <small>{formatDateTime(thread.lastSeenAt)}</small>
                              {unreadBadge && <span className="admins-ols-messenger-item-unread">1</span>}
                            </div>
                          </div>
                          <div className="admins-ols-messenger-item-sub">
                            {conversationContextLabels.map((label) => (
                              <span key={`${thread.sessionId}-${label}`}>{label}</span>
                            ))}
                          </div>
                          <p>{getConversationPreview(thread)}</p>
                          <div className="admins-ols-messenger-item-foot">
                            <span>{thread.messageCount} messages</span>
                            {latestMessage?.cardCount > 0 && <span>{latestMessage.cardCount} cards</span>}
                            <span className={`admins-ols-badge is-${modeBadge.tone}`}>{modeBadge.label}</span>
                            {needsAttention && <span className="admins-ols-badge is-negative">Needs attention</span>}
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
                {!desktopFilteredConversations.length && (
                  <p className="admins-ols-empty">
                    {desktopConversationSearch || desktopConversationFilter !== "all"
                      ? "No conversations match this filter."
                      : "No conversation threads found yet."}
                  </p>
                )}
              </div>
            )}

            {shouldRenderConversationThread && (
              <div
                className={`admins-ols-messenger-thread${
                  isMobileInboxViewport && isMobileChatRoute ? " admins-ols-mobile-chat-shell" : ""
                }`}
              >
              {activeConversation ? (
                <>
                  {conversationNeedsAttention(activeConversation) && isMobileInboxViewport && (
                    <div className="admins-ols-conversation-alert">
                      <span className="admins-ols-badge is-negative">Needs attention</span>
                      <p>The concierge paused this thread because it started repeating or could not answer clearly.</p>
                    </div>
                  )}
                  <div className="admins-ols-conversation-head">
                    {isMobileInboxViewport && isMobileThreadOpen ? (
                      <div className="admins-ols-mobile-thread-nav">
                        <button
                          type="button"
                          className="admins-ols-mobile-back-btn"
                          onClick={closeMobileConversationThread}
                          aria-label="Back to conversation list"
                        >
                          ←
                        </button>
                        <div className="admins-ols-mobile-thread-nav-main">
                          <h3 className="admins-ols-conversation-title">{getConversationTitle(activeConversation)}</h3>
                          <p className="admins-ols-mobile-thread-nav-subtitle">
                            {getConversationChannelLabel(activeConversation)}
                            {" • "}
                            {isWhatsAppConversation(activeConversation)
                              ? getWhatsAppPhoneLabel(activeConversation) || "WhatsApp guest"
                              : activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                              ? activeConversation.city
                              : "Website"}
                          </p>
                          <p className="admins-ols-mobile-thread-nav-subtitle">
                            {activeConversationModeBadge.label}
                          </p>
                        </div>
                        <div className="admins-ols-mobile-thread-nav-actions">
                          <button
                            type="button"
                            className="admins-ols-mobile-head-action"
                            onClick={() => setIsMobileConversationInfoOpen((current) => !current)}
                            aria-label={isMobileConversationInfoOpen ? "Hide conversation info" : "Show conversation info"}
                            aria-expanded={isMobileConversationInfoOpen}
                            aria-controls="admins-ols-mobile-conversation-info"
                          >
                            Info
                          </button>
                          <button
                            type="button"
                            className="admins-ols-mobile-head-action"
                            onClick={() => handleConversationModeChange(isActiveConversationAi ? "human" : "ai")}
                            disabled={conversationModeUpdating}
                            aria-label={isActiveConversationAi ? "Take over conversation" : "Resume AI"}
                            title={isActiveConversationAi ? "Take over conversation" : "Resume AI"}
                          >
                            {conversationModeUpdating ? "..." : isActiveConversationAi ? "Take Over" : "Resume"}
                          </button>
                          <button
                            type="button"
                            className="admins-ols-mobile-head-action admins-ols-mobile-head-action--summary"
                            onClick={() =>
                              handleOpenConversationSummaryModal({
                                forceRefresh: false,
                              })
                            }
                            disabled={conversationSummaryLoading}
                            title="Generate a quick admin summary for this thread"
                            aria-label="Conversation summary"
                          >
                            {conversationSummaryLoading ? "..." : "AI"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* ── Desktop Thread Header (Clean) ── */}
                        <div className="admins-ols-conversation-head-main">
                          <div className="admins-ols-thread-identity">
                            <h3 className="admins-ols-conversation-title">
                              {getConversationTitle(activeConversation)}
                            </h3>
                            {conversationNeedsAttention(activeConversation) && (
                              <span className="admins-ols-badge is-negative">Needs attention</span>
                            )}
                            <span className={`admins-ols-badge is-${activeConversationModeBadge.tone} admins-ols-mode-badge`}>
                              {activeConversationModeBadge.label}
                            </span>
                          </div>
                          {lastGuestMessagePreview && (
                            <p className="admins-ols-conversation-preview">
                              {lastGuestMessagePreview}
                            </p>
                          )}
                        </div>

                        <div className="admins-ols-conversation-head-aside">
                          <small className="admins-ols-conversation-timestamp">
                            {formatDateTime(activeConversation.lastSeenAt)}
                          </small>

                          {/* Details dropdown */}
                          <div className="admins-ols-details-dropdown" ref={detailsDropdownRef}>
                            <button
                              type="button"
                              className={`admins-ols-details-trigger${isDetailsOpen ? " is-open" : ""}`}
                              onClick={() => setIsDetailsOpen((v) => !v)}
                              aria-expanded={isDetailsOpen}
                              aria-haspopup="true"
                            >
                              Details
                              <span className="admins-ols-details-chevron" aria-hidden="true">
                                {isDetailsOpen ? "▲" : "▼"}
                              </span>
                            </button>
                            {isDetailsOpen && (
                              <div className="admins-ols-details-panel" role="dialog" aria-label="Conversation details">
                                <div className="admins-ols-details-section">
                                  <p className="admins-ols-details-label">Source</p>
                                  <div className="admins-ols-details-pills">
                                    {dedupeConversationLabels([
                                      formatPageLabel(activeConversation.pageType),
                                      getConversationChannelLabel(activeConversation),
                                      isWhatsAppConversation(activeConversation)
                                        ? getWhatsAppPhoneLabel(activeConversation) || "WhatsApp guest"
                                        : activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                                          ? activeConversation.city
                                          : "Website",
                                      activeConversation.listingId
                                        ? `Listing ${shortenId(activeConversation.listingId)}`
                                        : "",
                                    ]).map((label) => (
                                      <span key={`details-${activeConversation.sessionId}-${label}`} className="admins-ols-details-pill">
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="admins-ols-details-section">
                                  <p className="admins-ols-details-label">AI Status</p>
                                  <span className={`admins-ols-badge is-${activeConversationModeBadge.tone}`}>
                                    {activeConversationModeBadge.label}
                                  </span>
                                </div>
                                <div className="admins-ols-details-section">
                                  <p className="admins-ols-details-label">Messages</p>
                                  <span className="admins-ols-details-value">{activeConversation.messageCount} messages</span>
                                </div>
                                {activeConversation.assignedAdminName && (
                                  <div className="admins-ols-details-section">
                                    <p className="admins-ols-details-label">Assigned to</p>
                                    <span className="admins-ols-details-value">{activeConversation.assignedAdminName}</span>
                                  </div>
                                )}
                                {activeConversation.pathname && (
                                  <div className="admins-ols-details-section">
                                    <p className="admins-ols-details-label">Page</p>
                                    <span className="admins-ols-details-value admins-ols-details-path">
                                      {truncate(activeConversation.pathname, 80)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Compact action controls */}
                          <div className="admins-ols-conversation-mode-controls">
                            <button
                              type="button"
                              className="admins-ols-conversation-mode-btn"
                              onClick={() => handleConversationModeChange("human")}
                              disabled={conversationModeUpdating || isActiveConversationHuman}
                              title="Assign this conversation to human handling and pause AI replies"
                            >
                              {isActiveConversationHuman ? "Human Mode" : "Take Over"}
                            </button>
                            <button
                              type="button"
                              className="admins-ols-conversation-mode-btn"
                              onClick={() => handleConversationModeChange("paused")}
                              disabled={conversationModeUpdating || isActiveConversationPaused}
                              title="Pause AI auto-replies without assigning takeover ownership"
                            >
                              Pause AI
                            </button>
                            <button
                              type="button"
                              className="admins-ols-conversation-mode-btn is-resume"
                              onClick={() => handleConversationModeChange("ai")}
                              disabled={conversationModeUpdating || isActiveConversationAi}
                              title="Resume AI auto-replies for this conversation"
                            >
                              Resume AI
                            </button>
                            <button
                              type="button"
                              className="admins-ols-conversation-summary-trigger"
                              onClick={() => handleOpenConversationSummaryModal({ forceRefresh: false })}
                              disabled={conversationSummaryLoading}
                              title="Generate a quick admin summary for this thread"
                            >
                              {conversationSummaryLoading
                                ? "…"
                                : cachedSelectedConversationSummary?.text ||
                                    (conversationSummary?.sessionId === activeConversation.sessionId &&
                                      String(conversationSummary?.text || "").trim())
                                  ? "Summary"
                                  : "Summary"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {isMobileInboxViewport && isMobileThreadOpen && isMobileConversationInfoOpen && (
                    <div id="admins-ols-mobile-conversation-info" className="admins-ols-mobile-conversation-info">
                      <span>{formatPageLabel(activeConversation.pageType)}</span>
                      <span>{activeConversation.messageCount} messages</span>
                      <span>{formatDateTime(activeConversation.lastSeenAt)}</span>
                      {dedupeConversationLabels([
                        getConversationChannelLabel(activeConversation),
                        isWhatsAppConversation(activeConversation)
                          ? getWhatsAppPhoneLabel(activeConversation) || "WhatsApp guest"
                          : activeConversation.listingId
                            ? `Listing ${shortenId(activeConversation.listingId)}`
                            : activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                              ? activeConversation.city
                              : "",
                      ]).map((label) => (
                        <span key={`${activeConversation.sessionId}-thread-info-${label}`}>{label}</span>
                      ))}
                      {activeConversation.pathname && (
                        <p>{truncate(activeConversation.pathname, 96)}</p>
                      )}
                    </div>
                  )}
                  <div className="admins-ols-thread" ref={threadScrollRef}>
                    {activeConversation.messages.map((message) => (
                      <div
                        key={`${activeConversation.sessionId}-${message.messageId}`}
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
                      {isWhatsAppConversation(activeConversation) ? "Reply to WhatsApp guest" : "Reply as admin"}
                    </label>
                    <div className="admins-ols-thread-composer-tools" aria-hidden="true">
                      <span className="admins-ols-thread-composer-chip">Sender</span>
                      <span className="admins-ols-thread-composer-chip">Attach</span>
                    </div>
                    <div className="admins-ols-thread-composer-row">
                      {isMobileInboxViewport && isMobileThreadOpen && (
                        <button
                          type="button"
                          className="admins-ols-thread-composer-attach"
                          aria-label="Attachment options coming soon"
                          title="Attachment options coming soon"
                          onClick={(event) => event.preventDefault()}
                        >
                          +
                        </button>
                      )}
                      <textarea
                        id="admins-ols-reply"
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder={
                          isWhatsAppConversation(activeConversation)
                            ? "Send a WhatsApp reply as the OneLuxStay team..."
                            : "Reply to this guest conversation as the OneLuxStay team..."
                        }
                        rows={isMobileInboxViewport && isMobileThreadOpen ? 1 : 3}
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
                      <button
                        type="submit"
                        className="admins-ols-thread-composer-send"
                        disabled={sendingReply || !replyDraft.trim()}
                      >
                        {sendingReply ? "Sending..." : isMobileInboxViewport && isMobileThreadOpen ? "Send" : "Send Reply"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  {isMobileInboxViewport && isMobileChatRoute && (
                    <div className="admins-ols-conversation-head">
                      <div className="admins-ols-mobile-thread-nav">
                        <button
                          type="button"
                          className="admins-ols-mobile-back-btn"
                          onClick={closeMobileConversationThread}
                          aria-label="Back to conversation list"
                        >
                          ←
                        </button>
                        <div className="admins-ols-mobile-thread-nav-main">
                          <h3 className="admins-ols-conversation-title">Conversation not available</h3>
                          <p className="admins-ols-mobile-thread-nav-subtitle">
                            This thread was not found or is still loading.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="admins-ols-empty">Select a conversation to read the thread.</p>
                </>
              )}
              </div>
            )}
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
          id="panel-properties"
          role="tabpanel"
          aria-labelledby="tab-properties"
          hidden={displayedTabId !== "properties"}
          className="admins-ols-grid"
        >
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Property Library</h2>
              <span className="admins-ols-pill is-live">R2 Media</span>
            </div>
            <p className="admins-ols-copy">
              Manage listing information and upload property photography directly to Cloudflare R2.
            </p>
            <PropertyManager apiBase={apiBase} session={session} />
          </article>
        </section>

        <section
          id="panel-promos"
          role="tabpanel"
          aria-labelledby="tab-promos"
          hidden={displayedTabId !== "promos"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Booking Promos</h2>
              <span className="admins-ols-pill is-live">Published</span>
            </div>
            <p className="admins-ols-copy">
              Set the discounts displayed in the property booking promo selector. Changes apply to new quotes.
            </p>
            <form className="admins-ols-form" onSubmit={handleSavePromos}>
              {[
                ["usa", "USA"],
                ["antwerp", "Antwerp, Belgium"],
                ["dubai", "Dubai, UAE"],
              ].map(([regionKey, regionLabel]) => (
                <fieldset key={regionKey} className="admins-ols-promo-fieldset">
                  <legend>{regionLabel}</legend>
                  {[
                    ["weekly", "Weekly Promo"],
                    ["biWeekly", "Bi-Weekly Promo"],
                    ["monthly", "Monthly Promo"],
                  ].map(([key, label]) => (
                    <label key={`${regionKey}-${key}`}>
                      {label} discount (%)
                      <input
                        type="number"
                        min="0"
                        max="90"
                        step="1"
                        value={promoConfig[regionKey]?.[key] ?? 0}
                        onChange={(event) =>
                          setPromoConfig((current) => ({
                            ...current,
                            [regionKey]: { ...current[regionKey], [key]: event.target.value },
                          }))
                        }
                        disabled={savingPromos}
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
              <button type="submit" disabled={savingPromos}>
                {savingPromos ? "Publishing promos..." : "Save & Publish Promos"}
              </button>
              {promoNotice && <p className="admins-ols-note" role="status">{promoNotice}</p>}
            </form>
          </article>
          <article className="admins-ols-card admins-ols-stat">
            <span>Current Promo Schedule</span>
            <strong>Market-specific</strong>
            <small>USA, Antwerp, and Dubai can each use different percentages.</small>
          </article>
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
                sign in on <Link className="admins-ols-inline-link" to="/executive-ols/login">/executive-ols/login</Link>.
              </p>
              <p className="admins-ols-note" style={{ marginTop: 0 }}>
                Invite redirect target: <strong>{ADMIN_INVITE_ORIGIN}</strong>
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
    {isConversationSummaryModalOpen && activeConversation && (
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
                <strong>{getConversationTitle(activeConversation)}</strong>
                <small>
                  {formatPageLabel(activeConversation.pageType)}{" "}
                  {activeConversation.city && activeConversation.city.toLowerCase() !== "unknown city"
                    ? `| ${activeConversation.city}`
                    : ""}
                  {activeConversation.listingId ? ` | Listing ${shortenId(activeConversation.listingId)}` : ""}
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
              conversationSummary.sessionId === activeConversation.sessionId && (
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
              (!conversationSummary || conversationSummary.sessionId !== activeConversation.sessionId) && (
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
