import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import apiBase from "../utils/apiBase";
import {
  clearExecutiveOlsSession,
  getExecutiveOlsAuthHeaders,
  isExecutiveOlsSessionExpired,
  loadExecutiveOlsSession,
  refreshExecutiveOlsSession,
} from "./utils/executiveOlsAuth";
import "./ExecutiveOls.css";

const QUICK_PROMPTS = [
  "Give me a quick executive summary for today.",
  "Which property needs attention right now?",
  "Summarize current booking performance.",
  "Draft a professional reply to a guest complaint.",
];

const VIEW_OPTIONS = [
  { id: "assistant", label: "AI Assistant" },
  { id: "whatsapp", label: "WhatsApp" },
];

const TIME_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "next_30_days", label: "Next 30 days" },
];

const WHATSAPP_TEST_PROMPTS = [
  "Check availability in Miami from 2026-05-10 to 2026-05-13 for 2 guests",
  "I want a 2 bedroom in Los Angeles from 2026-06-01 to 2026-06-05 for 4 guests",
  "Check my booking status. My reservation code is GY-aeDHKynZ",
];

const EXECUTIVE_OLS_VOICE_CALL_NUMBER_KEY = "ols-executive-voice-call-number";

const sanitizePhoneInput = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return hasPlus ? "+" : "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const formatCurrency = (value, currency = "USD") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${String(currency || "USD").toUpperCase()}`;
  }
};

const formatDate = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
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

const getWhatsAppPhoneE164 = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  if (!sessionId.toLowerCase().startsWith("whatsapp:")) return "";
  const digits = sessionId.slice("whatsapp:".length).replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

const getConversationLatestMessage = (thread = {}) => {
  const threadMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  return threadMessages[threadMessages.length - 1] || null;
};

const getConversationLatestGuestMessage = (thread = {}) => {
  const threadMessages = Array.isArray(thread?.messages) ? [...thread.messages] : [];
  return threadMessages.reverse().find((message) => getConversationMessageSenderType(message) === "guest") || null;
};

const getConversationTitle = (thread = {}) => {
  if (isWhatsAppConversation(thread)) {
    return `WhatsApp ${getWhatsAppPhoneLabel(thread) || "guest"}`;
  }

  const city = String(thread?.city || "").trim();
  if (city) return city;
  return "Guest conversation";
};

const getConversationPreview = (thread = {}) => {
  const latestMessage = getConversationLatestMessage(thread);
  const content = String(latestMessage?.content || "").trim();
  return content.length > 140 ? `${content.slice(0, 137)}...` : content || "No message content captured yet.";
};

const polishReplyDraft = (value = "") => {
  const normalized = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  if (!normalized) return "";

  return normalized
    .split("\n")
    .map((line) => {
      const compact = line.replace(/\s+([,!.?])/g, "$1");
      const withCapital = compact.charAt(0).toUpperCase() + compact.slice(1);
      return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
    })
    .join("\n");
};

const getReplyAssistSummary = (thread = {}, draft = "") => {
  const guestMessage = getConversationLatestGuestMessage(thread);
  const guestText = String(guestMessage?.content || "").trim();
  const polishedDraft = polishReplyDraft(draft);
  const lowerGuestText = guestText.toLowerCase();

  let guidance = "Answer clearly, confirm the main request, and end with one helpful next step.";
  if (/\b(available|availability|dates|tomorrow|today|monday|check[- ]?in|check[- ]?out)\b/.test(lowerGuestText)) {
    guidance = "Confirm the exact dates and guest count, then answer availability in a simple and direct way.";
  } else if (/\b(price|pricing|rate|cost)\b/.test(lowerGuestText)) {
    guidance = "Acknowledge the request, then share the rate or ask for the missing stay details needed to quote it.";
  } else if (/\b(status|reservation|booking code|confirmation)\b/.test(lowerGuestText)) {
    guidance = "Confirm the booking reference or reservation details before giving a status update.";
  } else if (/\b(problem|issue|complaint|bad|broken|late|dirty)\b/.test(lowerGuestText)) {
    guidance = "Lead with empathy, apologize briefly, and offer the next action you will take right away.";
  }

  return {
    guestSummary: guestText || "No recent guest message selected.",
    guidance,
    polishedDraft,
    hasPolishChanges: polishedDraft && polishedDraft !== String(draft || "").trim(),
  };
};

const loadStoredExecutivePhoneNumber = () => {
  if (typeof window === "undefined") return "";
  try {
    const stored = sanitizePhoneInput(window.localStorage?.getItem(EXECUTIVE_OLS_VOICE_CALL_NUMBER_KEY) || "");
    return /^\+\d{7,}$/.test(stored) ? stored : "";
  } catch {
    return "";
  }
};

const ExecutiveIcon = ({ name = "chat", className = "" }) => {
  const commonProps = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "send") {
    return (
      <svg {...commonProps}>
        <path d="M21 3 10 14" />
        <path d="m21 3-7 18-4-7-7-4 18-7Z" />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg {...commonProps}>
        <path d="M12 3v5" />
        <path d="M12 16v5" />
        <path d="M4.9 4.9l3.5 3.5" />
        <path d="m15.6 15.6 3.5 3.5" />
        <path d="M3 12h5" />
        <path d="M16 12h5" />
        <path d="m4.9 19.1 3.5-3.5" />
        <path d="m15.6 8.4 3.5-3.5" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.8v4.6l3.2 1.9" />
      </svg>
    );
  }

  if (name === "erase") {
    return (
      <svg {...commonProps}>
        <path d="m9 4 9 9" />
        <path d="M5.6 13.4 12 7l4.6 4.6-6.4 6.4a2 2 0 0 1-2.8 0l-1.8-1.8a2 2 0 0 1 0-2.8Z" />
        <path d="M14 19h6" />
      </svg>
    );
  }

  if (name === "phone") {
    return (
      <svg {...commonProps}>
        <path d="M20 16.2v2.6a1.8 1.8 0 0 1-2 1.8A17.8 17.8 0 0 1 3.4 6a1.8 1.8 0 0 1 1.8-2H7.8a1.8 1.8 0 0 1 1.8 1.5l.5 3a1.8 1.8 0 0 1-.5 1.6l-1.3 1.3a14.5 14.5 0 0 0 4.3 4.3l1.3-1.3a1.8 1.8 0 0 1 1.6-.5l3 .5a1.8 1.8 0 0 1 1.5 1.8Z" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...commonProps}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
    );
  }

  if (name === "menu") {
    return (
      <svg {...commonProps}>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </svg>
    );
  }

  if (name === "attach") {
    return (
      <svg {...commonProps}>
        <path d="m14.5 7.5-5.8 5.8a3 3 0 1 0 4.2 4.2l7.1-7.1a4.5 4.5 0 0 0-6.4-6.4l-7.4 7.4a6 6 0 0 0 8.5 8.5l5.1-5.1" />
      </svg>
    );
  }

  if (name === "smile") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9 10h.01" />
        <path d="M15 10h.01" />
        <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      </svg>
    );
  }

  if (name === "check-double") {
    return (
      <svg {...commonProps}>
        <path d="m6.5 12.5 2.2 2.2 4.3-4.3" />
        <path d="m11 12.5 2.2 2.2 4.3-4.3" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M7 18.5 3.5 21V6.8A2.8 2.8 0 0 1 6.3 4h11.4a2.8 2.8 0 0 1 2.8 2.8v8.4a2.8 2.8 0 0 1-2.8 2.8H7Z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 13h4.5" />
    </svg>
  );
};

const getConversationAvatarLabel = (thread = {}) => {
  const phone = getWhatsAppPhoneLabel(thread);
  if (phone) return phone.slice(-2);
  return "WA";
};

const getConversationNotificationSignature = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  const lastSeenAt = String(thread?.lastSeenAt || "").trim();
  const messageCount = Number(thread?.messageCount || 0);
  if (!sessionId) return "";
  return `${sessionId}:${lastSeenAt}:${messageCount}`;
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
  if (senderType === "admin") return message?.metadata?.senderName || "OneLuxStay Team";
  return "Lucy";
};

const getConversationMessageAvatarLabel = (message = {}) => {
  const senderType = getConversationMessageSenderType(message);
  if (senderType === "guest") return "G";
  if (senderType === "admin") return "OL";
  return "LU";
};

const getConversationMessageBubbleClass = (message = {}) => {
  if (message?.role === "user") return "executive-ols-thread-bubble--guest";
  return getConversationMessageSenderType(message) === "admin"
    ? "executive-ols-thread-bubble--admin"
    : "executive-ols-thread-bubble--assistant";
};

const injectReplyIntoThreads = (threads = [], sessionId = "", message = {}) =>
  (Array.isArray(threads) ? threads : []).map((thread) => {
    if (thread?.sessionId !== sessionId) return thread;
    const existingMessages = Array.isArray(thread?.messages) ? thread.messages : [];
    const nextMessages = [...existingMessages.filter((item) => item?.messageId !== message?.messageId), message].sort(
      (left, right) => toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt),
    );

    return {
      ...thread,
      lastSeenAt: message?.createdAt || thread?.lastSeenAt || "",
      messageCount: nextMessages.length,
      messages: nextMessages,
    };
  });

function ExecutiveOlsPage({ forceView = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => loadExecutiveOlsSession());
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState(() =>
    forceView || (String(location.pathname || "").includes("/whatsapp") ? "whatsapp" : "assistant"),
  );
  const [timeRange, setTimeRange] = useState("this_week");
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [sendingWhatsAppReply, setSendingWhatsAppReply] = useState(false);
  const [startingVoiceCall, setStartingVoiceCall] = useState(false);
  const [replyAssistLoading, setReplyAssistLoading] = useState(false);
  const [replyAssistSuggestions, setReplyAssistSuggestions] = useState({});
  const [whatsappThreads, setWhatsappThreads] = useState([]);
  const [selectedWhatsAppSessionId, setSelectedWhatsAppSessionId] = useState("");
  const [whatsappSearchQuery, setWhatsappSearchQuery] = useState("");
  const [whatsappReplyDrafts, setWhatsappReplyDrafts] = useState({});
  const [voiceCallNumber, setVoiceCallNumber] = useState(() => loadStoredExecutivePhoneNumber());
  const [newWhatsAppPhone, setNewWhatsAppPhone] = useState("");
  const [newWhatsAppMessage, setNewWhatsAppMessage] = useState("");
  const [sendingNewWhatsApp, setSendingNewWhatsApp] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappNotice, setWhatsappNotice] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported",
  );
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "I can help with executive summaries, booking performance, listing context, and Guesty-backed operational questions.",
    },
  ]);
  const audioContextRef = useRef(null);
  const audioPrimedRef = useRef(false);
  const hydratedWhatsAppNotificationsRef = useRef(false);
  const notifiedWhatsAppSignaturesRef = useRef(new Set());

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Executive Dashboard";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.executiveOls = "true";
    document.head.appendChild(robotsMeta);

    return () => {
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const normalized = sanitizePhoneInput(voiceCallNumber);
      if (/^\+\d{7,}$/.test(normalized)) {
        window.localStorage?.setItem(EXECUTIVE_OLS_VOICE_CALL_NUMBER_KEY, normalized);
      } else {
        window.localStorage?.removeItem(EXECUTIVE_OLS_VOICE_CALL_NUMBER_KEY);
      }
    } catch {
      // Ignore storage failures for the callback number helper.
    }
  }, [voiceCallNumber]);

  useEffect(() => {
    let active = true;

    const ensureSessionAndLoad = async () => {
      let currentSession = session || loadExecutiveOlsSession();
      if (!currentSession?.accessToken) {
        if (active) setLoadingSnapshot(false);
        return;
      }

      if (isExecutiveOlsSessionExpired(currentSession)) {
        const refreshed = await refreshExecutiveOlsSession(currentSession).catch(() => null);
        if (!active) return;
        if (!refreshed?.accessToken) {
          clearExecutiveOlsSession();
          setSession(null);
          setLoadingSnapshot(false);
          return;
        }
        currentSession = refreshed;
        setSession(refreshed);
      }

      setLoadingSnapshot(true);
      setError("");

      try {
        const params = new URLSearchParams({
          range: timeRange,
        });
        if (propertyId) params.set("propertyId", propertyId);

        const response = await fetch(`${apiBase}/executive-ols-assistant?${params.toString()}`, {
          method: "GET",
          headers: {
            ...getExecutiveOlsAuthHeaders(currentSession),
          },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            clearExecutiveOlsSession();
            setSession(null);
            return;
          }
          throw new Error(payload?.error || "Unable to load executive snapshot.");
        }

        if (!active) return;
        setSnapshot(payload?.snapshot || null);
        setNotice(payload?.snapshot?.syncStatus?.message || "");
      } catch (requestError) {
        if (!active) return;
        setError(String(requestError?.message || "Unable to load executive snapshot."));
      } finally {
        if (active) setLoadingSnapshot(false);
      }
    };

    ensureSessionAndLoad();

    return () => {
      active = false;
    };
  }, [propertyId, session, timeRange]);

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
    if (!whatsappThreads.length) {
      setSelectedWhatsAppSessionId("");
      return;
    }

    if (!selectedWhatsAppSessionId || !whatsappThreads.some((thread) => thread?.sessionId === selectedWhatsAppSessionId)) {
      setSelectedWhatsAppSessionId(String(whatsappThreads[0]?.sessionId || ""));
    }
  }, [selectedWhatsAppSessionId, whatsappThreads]);

  useEffect(() => {
    let active = true;

    const loadWhatsAppThreads = async ({ silent = false } = {}) => {
      if (!session?.accessToken) return;
      if (!silent) setLoadingWhatsApp(true);
      if (!silent) setWhatsappError("");

      try {
        const response = await fetch(`${apiBase}/admins-ols`, {
          method: "GET",
          headers: {
            ...getExecutiveOlsAuthHeaders(session),
          },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            clearExecutiveOlsSession();
            setSession(null);
            return;
          }
          throw new Error(payload?.error || "Unable to load WhatsApp conversations.");
        }

        if (!active) return;
        const nextThreads = Array.isArray(payload?.recentConversations)
          ? payload.recentConversations.filter(isWhatsAppConversation)
          : [];
        setWhatsappThreads(nextThreads);
      } catch (requestError) {
        if (!active) return;
        setWhatsappError(String(requestError?.message || "Unable to load WhatsApp conversations."));
      } finally {
        if (active && !silent) setLoadingWhatsApp(false);
      }
    };

    if (activeView === "whatsapp") {
      void loadWhatsAppThreads();
      const intervalId = window.setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        loadWhatsAppThreads({ silent: true }).catch(() => null);
      }, 6000);

      return () => {
        active = false;
        window.clearInterval(intervalId);
      };
    }

    return () => {
      active = false;
    };
  }, [activeView, session]);

  useEffect(() => {
    if (activeView !== "whatsapp") return;
    if (!whatsappThreads.length) {
      hydratedWhatsAppNotificationsRef.current = true;
      return;
    }

    const signatures = whatsappThreads
      .map((thread) => getConversationNotificationSignature(thread))
      .filter(Boolean);

    if (!hydratedWhatsAppNotificationsRef.current) {
      signatures.forEach((signature) => notifiedWhatsAppSignaturesRef.current.add(signature));
      hydratedWhatsAppNotificationsRef.current = true;
      return;
    }

    const newGuestThreads = whatsappThreads.filter((thread) => {
      const signature = getConversationNotificationSignature(thread);
      if (!signature || notifiedWhatsAppSignaturesRef.current.has(signature)) return false;
      const latestMessage = getConversationLatestMessage(thread);
      return latestMessage?.role === "user";
    });

    signatures.forEach((signature) => notifiedWhatsAppSignaturesRef.current.add(signature));
    if (!newGuestThreads.length) return;

    const newestThread = [...newGuestThreads].sort(
      (left, right) => toTimestamp(right?.lastSeenAt) - toTimestamp(left?.lastSeenAt),
    )[0];
    const latestMessage = getConversationLatestMessage(newestThread);

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
        [0, 0.24].forEach((offset) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(offset === 0 ? 988 : 1318, startAt + offset);
          gain.gain.setValueAtTime(0.0001, startAt + offset);
          gain.gain.exponentialRampToValueAtTime(0.08, startAt + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.2);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt + offset);
          oscillator.stop(startAt + offset + 0.22);
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
        const notification = new window.Notification("New WhatsApp Message", {
          body: `${getConversationTitle(newestThread)}: ${String(latestMessage?.content || "").trim() || "New guest message"}`,
          tag: getConversationNotificationSignature(newestThread),
          renotify: true,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus?.();
          setSelectedWhatsAppSessionId(newestThread.sessionId);
          notification.close();
        };
      } catch {
        // Ignore notification failures.
      }
    };

    void playAlertTone();
    showBrowserNotification();
  }, [activeView, whatsappThreads]);

  const handleEnableWhatsAppAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setWhatsappError("Browser notifications are not supported in this browser.");
      return;
    }

    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setWhatsappNotice("WhatsApp alerts enabled for this browser.");
        return;
      }
      if (permission === "denied") {
        setWhatsappError("Browser notifications were blocked. Enable them in your browser settings if you want desktop alerts.");
      }
    } catch {
      setWhatsappError("Unable to enable browser notifications right now.");
    }
  };

  const handleLogout = () => {
    clearExecutiveOlsSession();
    setSession(null);
    navigate("/executive-ols/login", { replace: true });
  };

  const handleSubmit = async (nextQuery = "") => {
    const prompt = String(nextQuery || draft || "").trim();
    if (!prompt || submitting || !session?.accessToken) return;

    const optimisticMessages = [...messages, { role: "user", content: prompt }];
    setMessages(optimisticMessages);
    setDraft("");
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${apiBase}/executive-ols-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getExecutiveOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          query: prompt,
          messages: optimisticMessages.slice(-8),
          range: timeRange,
          propertyId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Executive assistant request failed.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(payload?.answer || "No answer returned."),
        },
      ]);
      if (payload?.snapshot) {
        setSnapshot(payload.snapshot);
        setNotice(payload.snapshot?.syncStatus?.message || "");
      }
    } catch (requestError) {
      setError(String(requestError?.message || "Executive assistant request failed."));
      setMessages((current) => current.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendWhatsAppReply = async (event) => {
    event.preventDefault();
    if (!selectedWhatsAppSessionId || !session?.accessToken) return;

    const selectedThread = whatsappThreads.find((thread) => thread?.sessionId === selectedWhatsAppSessionId);
    const content = String(whatsappReplyDraft || "").trim();
    if (!selectedThread || !content) return;

    setSendingWhatsAppReply(true);
    setWhatsappError("");
    setWhatsappNotice("");

    try {
      const response = await fetch(`${apiBase}/admins-ols`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getExecutiveOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          action: "send_reply",
          sessionId: selectedThread.sessionId,
          content,
          pageContext: {
            pageType: selectedThread.pageType,
            city: selectedThread.city,
            listingId: selectedThread.listingId,
            pathname: selectedThread.pathname,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Unable to send WhatsApp reply.");
      }

      if (payload?.message?.messageId) {
        setWhatsappThreads((current) => injectReplyIntoThreads(current, selectedThread.sessionId, payload.message));
      }
      clearWhatsAppDraft(selectedThread.sessionId);
      setWhatsappNotice("WhatsApp reply sent.");
    } catch (requestError) {
      setWhatsappError(String(requestError?.message || "Unable to send WhatsApp reply."));
    } finally {
      setSendingWhatsAppReply(false);
    }
  };

  const handleStartWhatsAppConversation = async (event) => {
    event.preventDefault();
    if (!session?.accessToken) return;

    const phoneNumber = sanitizePhoneInput(newWhatsAppPhone);
    const message = String(newWhatsAppMessage || "").trim();
    if (!phoneNumber || !message) return;

    setSendingNewWhatsApp(true);
    setWhatsappError("");
    setWhatsappNotice("");

    try {
      const response = await fetch(`${apiBase}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getExecutiveOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          message,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Unable to start WhatsApp conversation.");
      }

      const inboxResponse = await fetch(`${apiBase}/admins-ols`, {
        method: "GET",
        headers: {
          ...getExecutiveOlsAuthHeaders(session),
        },
      });
      const inboxPayload = await inboxResponse.json().catch(() => ({}));
      if (!inboxResponse.ok) {
        throw new Error(inboxPayload?.error || "Unable to refresh WhatsApp inbox.");
      }

      const nextThreads = Array.isArray(inboxPayload?.recentConversations)
        ? inboxPayload.recentConversations.filter(isWhatsAppConversation)
        : [];
      setWhatsappThreads(nextThreads);
      if (payload?.session_id) {
        setSelectedWhatsAppSessionId(String(payload.session_id));
      }
      setNewWhatsAppPhone("");
      setNewWhatsAppMessage("");
      setWhatsappNotice("WhatsApp message sent and conversation started.");
    } catch (requestError) {
      setWhatsappError(String(requestError?.message || "Unable to start WhatsApp conversation."));
    } finally {
      setSendingNewWhatsApp(false);
    }
  };

  const handleStartVoiceCall = async () => {
    if (!session?.accessToken || !selectedWhatsAppThread) return;

    const agentPhoneNumber = sanitizePhoneInput(voiceCallNumber);
    const agentPhoneDigits = agentPhoneNumber.replace(/[^\d]/g, "");
    if (!agentPhoneDigits || agentPhoneDigits.length < 7 || !agentPhoneNumber.startsWith("+")) {
      setWhatsappError("Enter your callback number in E.164 format (e.g. +15551234567) before starting a call.");
      setWhatsappNotice("");
      return;
    }

    setStartingVoiceCall(true);
    setWhatsappError("");
    setWhatsappNotice("");

    try {
      const response = await fetch(`${apiBase}/admins-ols`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getExecutiveOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          action: "start_voice_call",
          sessionId: selectedWhatsAppThread.sessionId,
          agentPhoneNumber,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Unable to start the voice call.");
      }

      setWhatsappNotice(
        `Twilio is calling ${agentPhoneNumber} now. Once you answer, it will connect you to ${getConversationTitle(selectedWhatsAppThread)}.`,
      );
    } catch (requestError) {
      setWhatsappError(String(requestError?.message || "Unable to start the voice call."));
    } finally {
      setStartingVoiceCall(false);
    }
  };

  const handleGetReplyAssist = async () => {
    if (!selectedWhatsAppThread || !session?.accessToken || replyAssistLoading) return;

    const guestMessage = getConversationLatestGuestMessage(selectedWhatsAppThread);
    if (!guestMessage?.content) return;

    setReplyAssistLoading(true);
    setWhatsappError("");

    try {
      const recentMessages = (Array.isArray(selectedWhatsAppThread.messages) ? selectedWhatsAppThread.messages : [])
        .slice(-8)
        .map((m) => ({
          role: getConversationMessageSenderType(m) === "guest" ? "user" : "assistant",
          content: String(m.content || ""),
        }));

      const response = await fetch(`${apiBase}/executive-ols-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getExecutiveOlsAuthHeaders(session),
        },
        body: JSON.stringify({
          query: `Draft a brief, professional WhatsApp reply as the OneLuxStay team to the guest's latest message: "${guestMessage.content}". Keep it 1-3 sentences, warm and direct, and end with one clear next step. Reply with the message text only, no labels or quotes.`,
          messages: recentMessages,
          range: timeRange,
          propertyId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Unable to generate reply suggestion.");
      }

      const suggestion = String(payload?.answer || "").trim();
      if (suggestion && selectedWhatsAppSessionId) {
        setReplyAssistSuggestions((current) => ({
          ...current,
          [selectedWhatsAppSessionId]: suggestion,
        }));
      }
    } catch (requestError) {
      setWhatsappError(String(requestError?.message || "Unable to generate reply suggestion."));
    } finally {
      setReplyAssistLoading(false);
    }
  };

  const stats = snapshot?.stats || {};
  const propertyOptions = Array.isArray(snapshot?.propertyOptions) ? snapshot.propertyOptions : [];
  const reservations = Array.isArray(snapshot?.reservations) ? snapshot.reservations : [];
  const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
  const syncStatusTone = snapshot?.syncStatus?.ok ? "is-positive" : "is-negative";
  const selectedWhatsAppThread = whatsappThreads.find((thread) => thread?.sessionId === selectedWhatsAppSessionId) || null;
  const normalizedWhatsappSearch = whatsappSearchQuery.trim().toLowerCase();
  const filteredWhatsappThreads = normalizedWhatsappSearch
    ? whatsappThreads.filter((thread) =>
        [
          getConversationTitle(thread),
          getConversationPreview(thread),
          getWhatsAppPhoneLabel(thread),
          thread?.sessionId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedWhatsappSearch),
      )
    : whatsappThreads;
  const whatsappThreadCountLabel = normalizedWhatsappSearch
    ? `${filteredWhatsappThreads.length} of ${whatsappThreads.length} chats`
    : `${whatsappThreads.length} active chats`;
  const whatsappReplyDraft = selectedWhatsAppSessionId
    ? String(whatsappReplyDrafts?.[selectedWhatsAppSessionId] || "")
    : "";
  const replyAssist = getReplyAssistSummary(selectedWhatsAppThread, whatsappReplyDraft);
  const aiSuggestedReply = selectedWhatsAppSessionId ? String(replyAssistSuggestions?.[selectedWhatsAppSessionId] || "") : "";
  const hasUsableSuggestion = !!aiSuggestedReply && aiSuggestedReply !== whatsappReplyDraft.trim();
  const replyPreview = aiSuggestedReply || replyAssist.polishedDraft;
  const showUseReplyButton = hasUsableSuggestion || replyAssist.hasPolishChanges;
  const selectedGuestPhoneNumber = getWhatsAppPhoneE164(selectedWhatsAppThread);
  const selectedPropertyLabel = propertyId
    ? propertyOptions.find((item) => item.value === propertyId)?.label || "Selected property"
    : "All properties";

  const updateWhatsAppDraft = (sessionId, value) => {
    const safeSessionId = String(sessionId || "").trim();
    if (!safeSessionId) return;
    setWhatsappReplyDrafts((current) => ({
      ...current,
      [safeSessionId]: value,
    }));
  };

  const clearWhatsAppDraft = (sessionId) => {
    const safeSessionId = String(sessionId || "").trim();
    if (!safeSessionId) return;
    setWhatsappReplyDrafts((current) => ({
      ...current,
      [safeSessionId]: "",
    }));
  };

  if (!session?.accessToken) {
    return <Navigate to="/executive-ols/login" replace />;
  }

  return (
    <div className="executive-ols-page">
      <div className={`executive-ols-shell${activeView === "whatsapp" ? " is-whatsapp" : ""}`}>
        <div className={`executive-ols-layout${activeView === "whatsapp" ? " is-whatsapp" : ""}`}>
          <aside className="executive-ols-sidebar" aria-label="Executive navigation">
            <div className="executive-ols-brand-card">
              <p className="executive-ols-eyebrow">OneLuxStay</p>
              <h1>Executive dashboard</h1>
            </div>

            <nav className="executive-ols-nav">
              {VIEW_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`executive-ols-nav-item${activeView === item.id ? " is-active" : ""}`}
                  onClick={() => setActiveView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="executive-ols-side-card">
              <p className="executive-ols-side-label">Session</p>
              <strong>{session?.user?.fullName || session?.user?.email || "Executive"}</strong>
              <span>{session?.user?.email || "Authenticated executive access"}</span>
              <button type="button" className="executive-ols-ghost-btn" onClick={handleLogout}>
                Sign out
              </button>
            </div>

            {activeView === "whatsapp" && (
              <div className="executive-ols-side-card executive-ols-side-card--whatsapp-status">
                <p className="executive-ols-side-label">WhatsApp</p>
                <div className="executive-ols-sidebar-status">
                  <button
                    type="button"
                    className={`executive-ols-ghost-btn executive-ols-alert-toggle${
                      notificationPermission === "granted" ? " is-enabled" : ""
                    }`}
                    onClick={handleEnableWhatsAppAlerts}
                    disabled={notificationPermission === "unsupported"}
                    title={
                      notificationPermission === "granted"
                        ? "Browser alerts are enabled"
                        : notificationPermission === "denied"
                          ? "Browser alerts are blocked"
                          : notificationPermission === "unsupported"
                            ? "Browser alerts are not supported in this browser"
                            : "Enable browser alerts"
                    }
                  >
                    {notificationPermission === "granted"
                      ? "Alerts On"
                      : notificationPermission === "denied"
                        ? "Alerts Blocked"
                        : notificationPermission === "unsupported"
                          ? "Alerts Unsupported"
                          : "Enable Alerts"}
                  </button>
                  <span className={`executive-ols-pill ${syncStatusTone}`}>
                    {snapshot?.syncStatus?.ok ? "Guesty synced" : "Sync issue"}
                  </span>
                  <span className="executive-ols-pill">
                    {loadingSnapshot ? "Refreshing..." : `Updated ${formatDate(snapshot?.generatedAt)}`}
                  </span>
                </div>
              </div>
            )}

            {activeView !== "whatsapp" && (
              <>
                <div className="executive-ols-side-card">
                  <p className="executive-ols-side-label">Filters</p>
                  <div className="executive-ols-side-controls">
                    <label className="executive-ols-field">
                      <span>Time range</span>
                      <select id="executive-range" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}>
                        {TIME_RANGE_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="executive-ols-field">
                      <span>Property</span>
                      <select
                        id="executive-property"
                        value={propertyId}
                        onChange={(event) => setPropertyId(event.target.value)}
                      >
                        <option value="">All properties</option>
                        {propertyOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="executive-ols-side-card">
                  <p className="executive-ols-side-label">Snapshot</p>
                  <div className="executive-ols-sidebar-status">
                    <span className={`executive-ols-pill ${syncStatusTone}`}>
                      {snapshot?.syncStatus?.ok ? "Guesty synced" : "Sync issue"}
                    </span>
                    <span className="executive-ols-pill">
                      {loadingSnapshot ? "Refreshing..." : `Updated ${formatDate(snapshot?.generatedAt)}`}
                    </span>
                  </div>
                  <div className="executive-ols-side-summary">
                    <article className="executive-ols-context-item">
                      <strong>Reservations</strong>
                      <span>
                        {Number(stats.totalReservations || 0)} total • {Number(stats.confirmedReservations || 0)} confirmed
                      </span>
                    </article>
                    <article className="executive-ols-context-item">
                      <strong>Revenue</strong>
                      <span>{formatCurrency(stats.projectedRevenue, stats.currency || "USD")}</span>
                    </article>
                    <article className="executive-ols-context-item">
                      <strong>Upcoming check-ins</strong>
                      <span>{Number(stats.upcomingCheckIns || 0)}</span>
                    </article>
                    <article className="executive-ols-context-item">
                      <strong>Property scope</strong>
                      <span>{selectedPropertyLabel}</span>
                    </article>
                  </div>
                </div>

                <div className="executive-ols-side-card">
                  <p className="executive-ols-side-label">Quick actions</p>
                  <div className="executive-ols-side-actions">
                    <Link to="/executive-ols" className="executive-ols-inline-link">
                      Open executive admin panel
                    </Link>
                    <button
                      type="button"
                      className="executive-ols-inline-link is-button"
                      onClick={() => handleSubmit("Give me the most important executive risks right now.")}
                    >
                      Ask for risks
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>

          <main className={`executive-ols-main${activeView === "whatsapp" ? " is-whatsapp" : ""}`}>
            {error && <div className="executive-ols-alert is-error">{error}</div>}
            {notice && !error && activeView !== "whatsapp" && <div className="executive-ols-alert">{notice}</div>}

            <div className="executive-ols-content-grid is-single-panel">
              <section className={`executive-ols-chat-card${activeView === "whatsapp" ? " is-whatsapp" : ""}`}>
                {activeView === "assistant" && (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">AI Assistant</p>
                        <h3>Chat with the assistant</h3>
                        <p>Ask about the business, draft messages, or request a fast executive readout.</p>
                      </div>
                    </div>

                    <div className="executive-ols-prompt-list">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button key={prompt} type="button" className="executive-ols-prompt" onClick={() => handleSubmit(prompt)}>
                          {prompt}
                        </button>
                      ))}
                    </div>

                    <div className="executive-ols-chat-thread" aria-live="polite">
                      {messages.map((message, index) => (
                        <article
                          key={`${message.role}-${index}`}
                          className={`executive-ols-message executive-ols-message--${message.role}`}
                        >
                          <span className="executive-ols-message-role">
                            {message.role === "assistant" ? "Assistant" : "You"}
                          </span>
                          <p>{message.content}</p>
                        </article>
                      ))}
                      {submitting && (
                        <article className="executive-ols-message executive-ols-message--assistant">
                          <span className="executive-ols-message-role">Assistant</span>
                          <p>Reviewing Guesty context...</p>
                        </article>
                      )}
                    </div>

                    <form
                      className="executive-ols-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleSubmit();
                      }}
                    >
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={4}
                        placeholder="Ask anything about bookings, listings, revenue, or operational issues..."
                      />
                      <div className="executive-ols-composer-actions">
                        <button type="button" className="executive-ols-ghost-btn" onClick={() => setMessages(messages.slice(0, 1))}>
                          Clear chat
                        </button>
                        <button type="submit" className="executive-ols-primary-btn" disabled={submitting || !draft.trim()}>
                          {submitting ? "Thinking..." : "Send"}
                        </button>
                      </div>
                    </form>
                  </>
                )}

                {activeView === "whatsapp" && (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">WhatsApp</p>
                        <div className="executive-ols-whatsapp-title-row">
                          <span className="executive-ols-icon-badge is-whatsapp">
                            <ExecutiveIcon name="chat" className="executive-ols-inline-icon" />
                          </span>
                          <div>
                            <h3>Inbox studio</h3>
                            <p>A cleaner, faster messaging workspace for live WhatsApp conversations and polished guest replies.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {whatsappNotice && <div className="executive-ols-alert">{whatsappNotice}</div>}
                    {whatsappError && <div className="executive-ols-alert is-error">{whatsappError}</div>}

                    <div className="executive-ols-whatsapp-inbox">
                      <div className="executive-ols-whatsapp-sessions-wrap">
                        <div className="executive-ols-whatsapp-panel-topbar">
                          <div>
                            <strong>Conversations</strong>
                            <span>{whatsappThreadCountLabel}</span>
                          </div>
                          <span className="executive-ols-whatsapp-meta-pill">
                            <ExecutiveIcon name="spark" className="executive-ols-inline-icon" />
                            Live
                          </span>
                        </div>
                        <div className="executive-ols-whatsapp-panel-tools">
                          <label className="executive-ols-whatsapp-search" aria-label="Search WhatsApp conversations">
                            <ExecutiveIcon name="search" className="executive-ols-inline-icon" />
                            <input
                              type="search"
                              value={whatsappSearchQuery}
                              onChange={(event) => setWhatsappSearchQuery(event.target.value)}
                              placeholder="Search guest, number, or message"
                            />
                          </label>
                        </div>

                        <div className="executive-ols-whatsapp-sessions" role="list" aria-label="WhatsApp conversations">
                        {loadingWhatsApp && !whatsappThreads.length && (
                          <p className="executive-ols-empty">Loading WhatsApp conversations...</p>
                        )}

                        {!loadingWhatsApp &&
                          filteredWhatsappThreads.map((thread) => (
                            <button
                              key={thread.sessionId}
                              type="button"
                              className={`executive-ols-whatsapp-session${thread.sessionId === selectedWhatsAppSessionId ? " is-active" : ""}`}
                              onClick={() => setSelectedWhatsAppSessionId(thread.sessionId)}
                            >
                              <div className="executive-ols-whatsapp-session-avatar">
                                <span>{getConversationAvatarLabel(thread)}</span>
                                <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                              </div>
                              <div className="executive-ols-whatsapp-session-body">
                                <div className="executive-ols-whatsapp-session-head">
                                  <div className="executive-ols-whatsapp-session-title">
                                    <strong>{getConversationTitle(thread)}</strong>
                                    {thread.sessionId === selectedWhatsAppSessionId && (
                                      <span className="executive-ols-whatsapp-session-status">Open</span>
                                    )}
                                  </div>
                                  <small>
                                    <ExecutiveIcon name="clock" className="executive-ols-inline-icon" />
                                    {formatDate(thread.lastSeenAt)}
                                  </small>
                                </div>
                                <div className="executive-ols-whatsapp-session-sub">
                                  <span className="executive-ols-whatsapp-contact-pill">
                                    <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                                    {getWhatsAppPhoneLabel(thread) || "WhatsApp guest"}
                                  </span>
                                  <span className="executive-ols-whatsapp-counter">{thread.messageCount || 0}</span>
                                </div>
                                <p>{getConversationPreview(thread)}</p>
                              </div>
                            </button>
                          ))}

                        {!loadingWhatsApp && !whatsappThreads.length && (
                          <div className="executive-ols-whatsapp-empty">
                            <p className="executive-ols-empty">No WhatsApp conversations yet.</p>
                            <small>Send the first WhatsApp message from here, or wait for a guest to message your Twilio sender.</small>
                            <div className="executive-ols-prompt-list">
                              {WHATSAPP_TEST_PROMPTS.map((prompt) => (
                                <button
                                  key={prompt}
                                  type="button"
                                  className="executive-ols-prompt"
                                  onClick={() => setNewWhatsAppMessage(prompt)}
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {!loadingWhatsApp && !!whatsappThreads.length && !filteredWhatsappThreads.length && (
                          <div className="executive-ols-whatsapp-empty">
                            <p className="executive-ols-empty">No chats match that search.</p>
                            <small>Try a guest phone number, session id, or a word from the latest message.</small>
                          </div>
                        )}
                        </div>
                      </div>

                      <div className="executive-ols-whatsapp-thread-panel">
                        {selectedWhatsAppThread ? (
                          <>
                            <div className="executive-ols-whatsapp-thread-head">
                              <div className="executive-ols-whatsapp-thread-identity">
                                <div className="executive-ols-whatsapp-thread-avatar">
                                  <span>{getConversationAvatarLabel(selectedWhatsAppThread)}</span>
                                  <ExecutiveIcon name="chat" className="executive-ols-inline-icon" />
                                </div>
                                <div>
                                  <p className="executive-ols-eyebrow">Conversation</p>
                                  <h3>{getConversationTitle(selectedWhatsAppThread)}</h3>
                                </div>
                              </div>
                              <div className="executive-ols-whatsapp-thread-toolbar" aria-hidden="true">
                                <span className="executive-ols-whatsapp-action-chip">
                                  <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                                </span>
                                <span className="executive-ols-whatsapp-action-chip">
                                  <ExecutiveIcon name="search" className="executive-ols-inline-icon" />
                                </span>
                                <span className="executive-ols-whatsapp-action-chip">
                                  <ExecutiveIcon name="menu" className="executive-ols-inline-icon" />
                                </span>
                              </div>
                            </div>

                            <div className="executive-ols-hero-meta executive-ols-whatsapp-thread-meta">
                              <span className="executive-ols-whatsapp-meta-pill">
                                <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                                {getWhatsAppPhoneLabel(selectedWhatsAppThread) || "WhatsApp guest"}
                              </span>
                              <span className="executive-ols-whatsapp-meta-pill">
                                <ExecutiveIcon name="spark" className="executive-ols-inline-icon" />
                                Twilio WhatsApp
                              </span>
                              <span className="executive-ols-whatsapp-meta-pill">
                                <ExecutiveIcon name="clock" className="executive-ols-inline-icon" />
                                {formatDateTime(selectedWhatsAppThread.lastSeenAt)}
                              </span>
                            </div>

                            <div className="executive-ols-whatsapp-callbar">
                              <label className="executive-ols-whatsapp-call-input">
                                <span>Call me on</span>
                                <input
                                  type="tel"
                                  value={voiceCallNumber}
                                  onChange={(event) => setVoiceCallNumber(sanitizePhoneInput(event.target.value))}
                                  placeholder="+15551234567"
                                />
                              </label>
                              <div className="executive-ols-whatsapp-call-actions">
                                {selectedGuestPhoneNumber && (
                                  <a className="executive-ols-ghost-btn executive-ols-whatsapp-call-link" href={`tel:${selectedGuestPhoneNumber}`}>
                                    <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                                    Open dialer
                                  </a>
                                )}
                                <button
                                  type="button"
                                  className="executive-ols-primary-btn"
                                  onClick={handleStartVoiceCall}
                                  disabled={startingVoiceCall || !selectedGuestPhoneNumber || !/^\+\d{7,}$/.test(sanitizePhoneInput(voiceCallNumber))}
                                >
                                  <ExecutiveIcon name="phone" className="executive-ols-inline-icon" />
                                  {startingVoiceCall ? "Calling..." : "Call guest"}
                                </button>
                              </div>
                            </div>

                            <div className="executive-ols-whatsapp-thread" aria-live="polite">
                              {(Array.isArray(selectedWhatsAppThread.messages) ? selectedWhatsAppThread.messages : []).map((message) => {
                                const senderType = getConversationMessageSenderType(message);
                                const isTeamMessage = senderType !== "guest";

                                return (
                                  <article
                                    key={`${selectedWhatsAppThread.sessionId}-${message.messageId}`}
                                    className={`executive-ols-thread-bubble ${getConversationMessageBubbleClass(message)}`}
                                  >
                                    <div className="executive-ols-thread-bubble-meta">
                                      <span className="executive-ols-thread-bubble-avatar">
                                        {getConversationMessageAvatarLabel(message)}
                                      </span>
                                      <span className="executive-ols-message-role">{getConversationMessageLabel(message)}</span>
                                    </div>
                                    <div className="executive-ols-thread-bubble-body">
                                      <p>{message.content || "No message content captured."}</p>
                                    </div>
                                    <div className="executive-ols-thread-bubble-foot">
                                      <small>{formatDateTime(message.createdAt)}</small>
                                      {isTeamMessage && (
                                        <span className="executive-ols-thread-delivery">
                                          <ExecutiveIcon name="check-double" className="executive-ols-inline-icon" />
                                          Sent
                                        </span>
                                      )}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>

                            <form className="executive-ols-composer executive-ols-whatsapp-compose-shell" onSubmit={handleSendWhatsAppReply}>
                              <div className="executive-ols-whatsapp-assist">
                                <div className="executive-ols-whatsapp-assist-head">
                                  <button
                                    type="button"
                                    className="executive-ols-whatsapp-meta-pill executive-ols-reply-assist-btn"
                                    onClick={handleGetReplyAssist}
                                    disabled={replyAssistLoading || sendingWhatsAppReply || !replyAssist.guestSummary || replyAssist.guestSummary === "No recent guest message selected."}
                                  >
                                    <ExecutiveIcon name="spark" className={`executive-ols-inline-icon${replyAssistLoading ? " is-spinning" : ""}`} />
                                    {replyAssistLoading ? "Generating..." : "Reply assist"}
                                  </button>
                                  {showUseReplyButton && (
                                    <button
                                      type="button"
                                      className="executive-ols-ghost-btn"
                                      onClick={() => updateWhatsAppDraft(selectedWhatsAppSessionId, replyPreview)}
                                      disabled={sendingWhatsAppReply}
                                    >
                                      {aiSuggestedReply ? "Use AI reply" : "Use polished reply"}
                                    </button>
                                  )}
                                </div>
                                <div className="executive-ols-whatsapp-assist-grid">
                                  <article className="executive-ols-whatsapp-assist-card">
                                    <span>Guest said</span>
                                    <p>{replyAssist.guestSummary}</p>
                                  </article>
                                  <article className="executive-ols-whatsapp-assist-card">
                                    <span>Suggested direction</span>
                                    <p>{replyAssist.guidance}</p>
                                  </article>
                                  <article className="executive-ols-whatsapp-assist-card is-preview">
                                    <span>{aiSuggestedReply ? "AI reply suggestion" : "Polished preview"}</span>
                                    <p>{replyPreview || (replyAssistLoading ? "Generating a reply suggestion..." : "Click “Reply assist” to generate an AI reply suggestion based on the guest’s message.")}</p>
                                  </article>
                                </div>
                              </div>
                              <div className="executive-ols-whatsapp-compose-head">
                                <div>
                                  <span className="executive-ols-whatsapp-meta-pill">
                                    <ExecutiveIcon name="chat" className="executive-ols-inline-icon" />
                                    Reply as OneLuxStay
                                  </span>
                                  <p className="executive-ols-whatsapp-compose-copy">Keep it warm, crisp, and easy for the guest to act on.</p>
                                </div>
                                <div className="executive-ols-whatsapp-compose-tools" aria-hidden="true">
                                  <span className="executive-ols-whatsapp-action-chip">
                                    <ExecutiveIcon name="smile" className="executive-ols-inline-icon" />
                                  </span>
                                  <span className="executive-ols-whatsapp-action-chip">
                                    <ExecutiveIcon name="attach" className="executive-ols-inline-icon" />
                                  </span>
                                </div>
                              </div>
                              <div className="executive-ols-whatsapp-compose-input">
                                <textarea
                                  value={whatsappReplyDraft}
                                  onChange={(event) => updateWhatsAppDraft(selectedWhatsAppSessionId, event.target.value)}
                                  rows={4}
                                  placeholder="Reply to this WhatsApp guest as the OneLuxStay team..."
                                  disabled={sendingWhatsAppReply}
                                />
                              </div>
                              <div className="executive-ols-composer-actions">
                                <button
                                  type="button"
                                  className="executive-ols-ghost-btn"
                                  onClick={() => clearWhatsAppDraft(selectedWhatsAppSessionId)}
                                  disabled={sendingWhatsAppReply}
                                >
                                  <ExecutiveIcon name="erase" className="executive-ols-inline-icon" />
                                  Clear draft
                                </button>
                                <button
                                  type="submit"
                                  className="executive-ols-primary-btn"
                                  disabled={sendingWhatsAppReply || !whatsappReplyDraft.trim()}
                                >
                                  <ExecutiveIcon name="send" className="executive-ols-inline-icon" />
                                  {sendingWhatsAppReply ? "Sending..." : "Send WhatsApp reply"}
                                </button>
                              </div>
                            </form>
                          </>
                        ) : (
                          <div className="executive-ols-whatsapp-empty is-thread">
                            <div className="executive-ols-whatsapp-start">
                              <div>
                                <p className="executive-ols-eyebrow">Start conversation</p>
                                <h3>Send the first WhatsApp message</h3>
                                <p className="executive-ols-whatsapp-start-copy">
                                  Use a real guest phone number in E.164 format like `+15551234567`.
                                </p>
                              </div>

                              <form className="executive-ols-composer executive-ols-whatsapp-compose-shell" onSubmit={handleStartWhatsAppConversation}>
                                <label className="executive-ols-field">
                                  <span>Guest phone number</span>
                                  <input
                                    type="tel"
                                    value={newWhatsAppPhone}
                                    onChange={(event) => setNewWhatsAppPhone(event.target.value)}
                                    placeholder="+15551234567"
                                    disabled={sendingNewWhatsApp}
                                  />
                                </label>
                                <textarea
                                  value={newWhatsAppMessage}
                                  onChange={(event) => setNewWhatsAppMessage(event.target.value)}
                                  rows={4}
                                  placeholder="Write the first WhatsApp message..."
                                  disabled={sendingNewWhatsApp}
                                />
                                <div className="executive-ols-composer-actions">
                                  <button
                                    type="button"
                                    className="executive-ols-ghost-btn"
                                    onClick={() => setNewWhatsAppMessage("Hi, this is Lucy from OneLuxStay. How can I help today?")}
                                    disabled={sendingNewWhatsApp}
                                  >
                                    Use welcome message
                                  </button>
                                  <button
                                    type="submit"
                                    className="executive-ols-primary-btn"
                                    disabled={sendingNewWhatsApp || !newWhatsAppPhone.trim() || !newWhatsAppMessage.trim()}
                                  >
                                    {sendingNewWhatsApp ? "Sending..." : "Start WhatsApp chat"}
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {activeView === "dashboard" && (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">Overview</p>
                        <h3>Executive snapshot</h3>
                        <p>Fast operational context sourced from the latest Guesty sync.</p>
                      </div>
                    </div>
                    <div className="executive-ols-stack">
                      {reservations.slice(0, 5).map((item) => (
                        <article key={item.id} className="executive-ols-list-card">
                          <strong>{item.propertyName || "Reservation"}</strong>
                          <span>{item.guestName || item.confirmationCode || item.id}</span>
                          <small>
                            {formatDate(item.checkIn)} to {formatDate(item.checkOut)} • {item.status || "Unknown"}
                          </small>
                        </article>
                      ))}
                      {!reservations.length && <p className="executive-ols-empty">No reservations returned for this view yet.</p>}
                    </div>
                  </>
                )}

                {activeView === "bookings" && (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">Bookings</p>
                        <h3>Recent reservation feed</h3>
                        <p>Use this view for a quick scan of what is checking in and what may need action.</p>
                      </div>
                    </div>
                    <div className="executive-ols-stack">
                      {reservations.map((item) => (
                        <article key={item.id} className="executive-ols-list-card">
                          <div className="executive-ols-list-row">
                            <strong>{item.propertyName || "Reservation"}</strong>
                            <span>{formatCurrency(item.total || 0, item.currency || stats.currency || "USD")}</span>
                          </div>
                          <span>{item.guestName || item.confirmationCode || item.id}</span>
                          <small>
                            {formatDate(item.checkIn)} to {formatDate(item.checkOut)} • {item.status || "Unknown"}
                          </small>
                        </article>
                      ))}
                      {!reservations.length && <p className="executive-ols-empty">No reservations available yet.</p>}
                    </div>
                  </>
                )}

                {activeView === "reports" && (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">Reports</p>
                        <h3>Listing and city coverage</h3>
                        <p>Use this list to confirm which properties are represented in the current snapshot.</p>
                      </div>
                    </div>
                    <div className="executive-ols-stack">
                      {listings.map((item) => (
                        <article key={item.id} className="executive-ols-list-card">
                          <div className="executive-ols-list-row">
                            <strong>{item.title || "Listing"}</strong>
                            <span>{item.city || "Unknown city"}</span>
                          </div>
                          <small>
                            {item.bedrooms ? `${item.bedrooms} bd` : "Studios or mixed"} • {item.accommodates ? `${item.accommodates} guests` : "Capacity unavailable"}
                          </small>
                        </article>
                      ))}
                      {!listings.length && <p className="executive-ols-empty">No listings available yet.</p>}
                    </div>
                  </>
                )}
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveOlsPage;
