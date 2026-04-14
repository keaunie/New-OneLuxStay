import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
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

const getConversationTitle = (thread = {}) => {
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
  if (["lesson_deleted", "lesson_deactivated"].includes(normalized)) return "negative";
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
  const [accountForm, setAccountForm] = useState(() => ({
    fullName: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  }));
  const [savingAccount, setSavingAccount] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarDesktopPhase, setSidebarDesktopPhase] = useState("idle");
  const [activeTabId, setActiveTabId] = useState("overview");
  const [displayedTabId, setDisplayedTabId] = useState("overview");
  const [tabContentPhase, setTabContentPhase] = useState("idle");
  const threadScrollRef = useRef(null);
  const hasLoggedDashboardOpenRef = useRef(false);
  const sidebarPhaseTimeoutRef = useRef(null);
  const tabTransitionTimeoutRef = useRef(null);

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
  const selectedConversation =
    recentConversations.find((thread) => thread.sessionId === selectedConversationSessionId) ||
    recentConversations[0] ||
    null;

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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Admin";

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

  const performAdminRequest = async ({ method = "GET", payload } = {}, sessionOverride = session) => {
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
      if (typeof document !== "undefined" && document.hidden) return;
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
    { id: "guest-interest", label: "Guest Interest" },
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
    <div className="admins-ols-page">
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
                  <Link className="admins-ols-profile-action" to="/admins-ols/guest-journeys">
                    <span>Guest Journey Log</span>
                    <span className="admins-ols-side-nav-count">{recentGuestJourneyEvents.length || "Go"}</span>
                  </Link>
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
                    {item.label}
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
          id="panel-guest-interest"
          role="tabpanel"
          aria-labelledby="tab-guest-interest"
          hidden={displayedTabId !== "guest-interest"}
          className="admins-ols-grid admins-ols-grid--two"
        >
          <article className="admins-ols-card admins-ols-stat">
            <span>Guest Journey Events</span>
            <strong>{overview.guestJourneyEventsTotal ?? 0}</strong>
            <small>Tracked guest page views, listing clicks, city clicks, and search submits</small>
          </article>

          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Recent Guest Journey Events</h2>
              <span className="admins-ols-pill">{recentGuestJourneyEvents.length} rows</span>
            </div>
            <div className="admins-ols-stack">
              {recentGuestJourneyEvents.map((item) => (
                <article key={item.id || `${item.eventType}-${item.createdAt}`} className="admins-ols-log">
                  <div className="admins-ols-log-meta">
                    <span className="admins-ols-badge is-neutral">
                      {formatGuestJourneyEventLabel(item.eventType)}
                    </span>
                    <small>{formatDateTime(item.createdAt)}</small>
                  </div>
                  <p>
                    <strong>
                      {item.listingTitle || item.city || item.pathname || item.destinationPath || "Guest activity"}
                    </strong>
                  </p>
                  <p>{formatGuestClickSourceLabel(item)}</p>
                  <small>
                    {(item.pathname || item.destinationPath || "No path captured.")} |{" "}
                    {item.pageType || "Unknown page"} | {item.city || "Unknown city"}
                  </small>
                </article>
              ))}
              {!recentGuestJourneyEvents.length && (
                <p className="admins-ols-empty">No guest journey events tracked yet.</p>
              )}
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
                        <span>{thread.listingId ? `Listing ${shortenId(thread.listingId)}` : "No listing"}</span>
                      </div>
                      <p>{getConversationPreview(thread)}</p>
                      <div className="admins-ols-messenger-item-foot">
                        <span>{thread.messageCount} messages</span>
                        {latestMessage?.cardCount > 0 && <span>{latestMessage.cardCount} cards</span>}
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
                          {selectedConversation.city && selectedConversation.city.toLowerCase() !== "unknown city"
                            ? selectedConversation.city
                            : "Website"}
                        </span>
                        <span>
                          {selectedConversation.listingId
                            ? `Listing ${shortenId(selectedConversation.listingId)}`
                            : "No listing"}
                        </span>
                        <span>{selectedConversation.messageCount} messages</span>
                      </div>
                    </div>
                    <small>{formatDateTime(selectedConversation.lastSeenAt)}</small>
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
                      Reply as admin
                    </label>
                    <div className="admins-ols-thread-composer-row">
                      <textarea
                        id="admins-ols-reply"
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder="Reply to this guest conversation as the OneLuxStay team..."
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
                    className={`admins-ols-badge is-${item.metadata.responseMode === "fallback" ? "negative" : "neutral"}`}
                  >
                    {item.metadata.responseMode || "live"}
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
        </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminsOlsPage;
