import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
  { id: "dashboard", label: "Dashboard" },
  { id: "bookings", label: "Bookings" },
  { id: "reports", label: "Reports" },
  { id: "assistant", label: "AI Assistant" },
  { id: "whatsapp", label: "WhatsApp" },
];

const TIME_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "next_30_days", label: "Next 30 days" },
];

const DEFAULT_SITE_ORIGIN = "https://oneluxstayprop.netlify.app";
const WHATSAPP_SENDER_E164 = "+17159218069";
const WHATSAPP_DISPLAY_NAME = "Lucy";
const WHATSAPP_BUSINESS_EMAIL = "reservations@oneluxstay.com";
const WHATSAPP_PRIMARY_WEBSITE = "https://oneluxstay.com";
const WHATSAPP_SECONDARY_WEBSITE = "https://oneluxstayprop.netlify.app";
const WHATSAPP_BUSINESS_DESCRIPTION =
  "Lucy is OneLuxStay's WhatsApp concierge for luxury aparthotel stays, availability checks, booking guidance, and reservation support.";
const WHATSAPP_PROFILE_ABOUT =
  "Hi, I'm Lucy from OneLuxStay. Share your dates, guest count, or reservation code and I'll help right away.";
const WHATSAPP_TEST_PROMPTS = [
  "Check availability in Miami from 2026-05-10 to 2026-05-13 for 2 guests",
  "I want a 2 bedroom in Los Angeles from 2026-06-01 to 2026-06-05 for 4 guests",
  "Check my booking status. My reservation code is GY-aeDHKynZ",
];

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

const getConversationLatestMessage = (thread = {}) => {
  const threadMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  return threadMessages[threadMessages.length - 1] || null;
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

const getInitials = (session = {}) => {
  const name = String(session?.user?.fullName || session?.user?.email || "").trim();
  if (!name) return "EX";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
};

const resolveSiteOrigin = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return DEFAULT_SITE_ORIGIN;
};

function ExecutiveOlsPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadExecutiveOlsSession());
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState("assistant");
  const [timeRange, setTimeRange] = useState("this_week");
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState("");
  const siteOrigin = useMemo(() => resolveSiteOrigin(), []);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [sendingWhatsAppReply, setSendingWhatsAppReply] = useState(false);
  const [whatsappThreads, setWhatsappThreads] = useState([]);
  const [selectedWhatsAppSessionId, setSelectedWhatsAppSessionId] = useState("");
  const [whatsappReplyDraft, setWhatsappReplyDraft] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappNotice, setWhatsappNotice] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "I can help with executive summaries, booking performance, listing context, and Guesty-backed operational questions.",
    },
  ]);

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
      setWhatsappReplyDraft("");
      setWhatsappNotice("WhatsApp reply sent.");
    } catch (requestError) {
      setWhatsappError(String(requestError?.message || "Unable to send WhatsApp reply."));
    } finally {
      setSendingWhatsAppReply(false);
    }
  };

  const stats = snapshot?.stats || {};
  const propertyOptions = Array.isArray(snapshot?.propertyOptions) ? snapshot.propertyOptions : [];
  const reservations = Array.isArray(snapshot?.reservations) ? snapshot.reservations : [];
  const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
  const syncStatusTone = snapshot?.syncStatus?.ok ? "is-positive" : "is-negative";
  const heroEyebrow = activeView === "whatsapp" ? "WhatsApp concierge" : "AI Assistant";
  const heroTitle =
    activeView === "whatsapp"
      ? "Manage live WhatsApp chats."
      : "Ask direct questions about revenue, bookings, and issues.";
  const heroCopy =
    activeView === "whatsapp"
      ? "New guest messages from your WhatsApp sender appear here, and you can reply directly from this executive dashboard."
      : "The executive assistant uses Guesty-backed snapshot data and stays explicit when something cannot be verified live.";
  const whatsappWebhookUrl = `${siteOrigin}/.netlify/functions/whatsapp-webhook`;
  const whatsappStatusUrl = `${siteOrigin}/.netlify/functions/whatsapp-status`;
  const whatsappAliasUrl = `${siteOrigin}/api/whatsapp`;
  const whatsappStatusAliasUrl = `${siteOrigin}/api/whatsapp-status`;
  const whatsappClickToChatUrl = `https://wa.me/${WHATSAPP_SENDER_E164.replace(/[^\d]/g, "")}`;
  const selectedWhatsAppThread = whatsappThreads.find((thread) => thread?.sessionId === selectedWhatsAppSessionId) || null;

  if (!session?.accessToken) {
    return <Navigate to="/executive-ols/login" replace />;
  }

  return (
    <div className="executive-ols-page">
      <div className="executive-ols-shell">
        <div className="executive-ols-layout">
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
          </aside>

          <main className="executive-ols-main">
            <header className="executive-ols-topbar">
              <div className="executive-ols-field">
                <label htmlFor="executive-range">Time range</label>
                <select id="executive-range" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}>
                  {TIME_RANGE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="executive-ols-field">
                <label htmlFor="executive-property">Property</label>
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
              </div>

              <div className="executive-ols-profile-chip">
                <span className="executive-ols-avatar">{getInitials(session)}</span>
                <div>
                  <strong>{session?.user?.email || "Executive"}</strong>
                  <span>Executive</span>
                </div>
              </div>
            </header>

            <section className="executive-ols-hero">
              <div>
                <p className="executive-ols-eyebrow">{heroEyebrow}</p>
                <h2>{heroTitle}</h2>
                <p>{heroCopy}</p>
              </div>
              <div className="executive-ols-hero-meta">
                <span className={`executive-ols-pill ${syncStatusTone}`}>
                  {snapshot?.syncStatus?.ok ? "Guesty synced" : "Sync issue"}
                </span>
                <span className="executive-ols-pill">
                  {loadingSnapshot ? "Refreshing..." : `Updated ${formatDate(snapshot?.generatedAt)}`}
                </span>
              </div>
            </section>

            {error && <div className="executive-ols-alert is-error">{error}</div>}
            {notice && !error && <div className="executive-ols-alert">{notice}</div>}

            <section className="executive-ols-stat-grid">
              <article className="executive-ols-stat-card">
                <span>Reservations</span>
                <strong>{Number(stats.totalReservations || 0)}</strong>
                <small>{Number(stats.confirmedReservations || 0)} confirmed</small>
              </article>
              <article className="executive-ols-stat-card">
                <span>Projected revenue</span>
                <strong>{formatCurrency(stats.projectedRevenue, stats.currency || "USD")}</strong>
                <small>Selected date range</small>
              </article>
              <article className="executive-ols-stat-card">
                <span>Check-ins</span>
                <strong>{Number(stats.upcomingCheckIns || 0)}</strong>
                <small>Upcoming within range</small>
              </article>
              <article className="executive-ols-stat-card">
                <span>Listings</span>
                <strong>{Number(stats.listingCount || 0)}</strong>
                <small>{Number(stats.cityCount || 0)} cities tracked</small>
              </article>
            </section>

            <div className="executive-ols-content-grid">
              <section className="executive-ols-chat-card">
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
                        <h3>Live inbox</h3>
                        <p>See incoming WhatsApp messages here and reply directly from the executive dashboard.</p>
                      </div>
                    </div>

                    {whatsappNotice && <div className="executive-ols-alert">{whatsappNotice}</div>}
                    {whatsappError && <div className="executive-ols-alert is-error">{whatsappError}</div>}

                    <div className="executive-ols-whatsapp-inbox">
                      <div className="executive-ols-whatsapp-sessions" role="list" aria-label="WhatsApp conversations">
                        {loadingWhatsApp && !whatsappThreads.length && (
                          <p className="executive-ols-empty">Loading WhatsApp conversations...</p>
                        )}

                        {!loadingWhatsApp &&
                          whatsappThreads.map((thread) => (
                            <button
                              key={thread.sessionId}
                              type="button"
                              className={`executive-ols-whatsapp-session${thread.sessionId === selectedWhatsAppSessionId ? " is-active" : ""}`}
                              onClick={() => setSelectedWhatsAppSessionId(thread.sessionId)}
                            >
                              <div className="executive-ols-whatsapp-session-head">
                                <strong>{getConversationTitle(thread)}</strong>
                                <small>{formatDateTime(thread.lastSeenAt)}</small>
                              </div>
                              <span>{thread.messageCount || 0} messages</span>
                              <p>{getConversationPreview(thread)}</p>
                            </button>
                          ))}

                        {!loadingWhatsApp && !whatsappThreads.length && (
                          <div className="executive-ols-whatsapp-empty">
                            <p className="executive-ols-empty">No WhatsApp conversations yet.</p>
                            <small>Once the sender webhook is live, new guest messages will appear here automatically.</small>
                            <div className="executive-ols-prompt-list">
                              {WHATSAPP_TEST_PROMPTS.map((prompt) => (
                                <button
                                  key={prompt}
                                  type="button"
                                  className="executive-ols-prompt"
                                  onClick={() => handleSubmit(prompt)}
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="executive-ols-whatsapp-thread-panel">
                        {selectedWhatsAppThread ? (
                          <>
                            <div className="executive-ols-whatsapp-thread-head">
                              <div>
                                <p className="executive-ols-eyebrow">Conversation</p>
                                <h3>{getConversationTitle(selectedWhatsAppThread)}</h3>
                              </div>
                              <div className="executive-ols-hero-meta">
                                <span className="executive-ols-pill">Twilio WhatsApp</span>
                                <span className="executive-ols-pill">
                                  {formatDateTime(selectedWhatsAppThread.lastSeenAt)}
                                </span>
                              </div>
                            </div>

                            <div className="executive-ols-whatsapp-thread" aria-live="polite">
                              {(Array.isArray(selectedWhatsAppThread.messages) ? selectedWhatsAppThread.messages : []).map((message) => (
                                <article
                                  key={`${selectedWhatsAppThread.sessionId}-${message.messageId}`}
                                  className={`executive-ols-thread-bubble ${getConversationMessageBubbleClass(message)}`}
                                >
                                  <span className="executive-ols-message-role">{getConversationMessageLabel(message)}</span>
                                  <p>{message.content || "No message content captured."}</p>
                                  <small>{formatDateTime(message.createdAt)}</small>
                                </article>
                              ))}
                            </div>

                            <form className="executive-ols-composer" onSubmit={handleSendWhatsAppReply}>
                              <textarea
                                value={whatsappReplyDraft}
                                onChange={(event) => setWhatsappReplyDraft(event.target.value)}
                                rows={4}
                                placeholder="Reply to this WhatsApp guest as the OneLuxStay team..."
                                disabled={sendingWhatsAppReply}
                              />
                              <div className="executive-ols-composer-actions">
                                <button
                                  type="button"
                                  className="executive-ols-ghost-btn"
                                  onClick={() => setWhatsappReplyDraft("")}
                                  disabled={sendingWhatsAppReply}
                                >
                                  Clear draft
                                </button>
                                <button
                                  type="submit"
                                  className="executive-ols-primary-btn"
                                  disabled={sendingWhatsAppReply || !whatsappReplyDraft.trim()}
                                >
                                  {sendingWhatsAppReply ? "Sending..." : "Send WhatsApp reply"}
                                </button>
                              </div>
                            </form>
                          </>
                        ) : (
                          <div className="executive-ols-whatsapp-empty is-thread">
                            <p className="executive-ols-empty">Select a WhatsApp conversation to read and reply.</p>
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

              <aside className="executive-ols-context-card">
                {activeView === "whatsapp" ? (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">Twilio fields</p>
                        <h3>What to paste</h3>
                        <p>These are the exact values I recommend for your current sender setup.</p>
                      </div>
                    </div>

                    <div className="executive-ols-context-list">
                      <article className="executive-ols-context-item">
                        <strong>Webhook URL for incoming messages</strong>
                        <span>{whatsappWebhookUrl}</span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Status callback URL</strong>
                        <span>{whatsappStatusUrl}</span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Fallback URL for incoming messages</strong>
                        <span>Leave blank for now. It is optional and repeating the same webhook usually does not help.</span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Alternative alias URLs</strong>
                        <span>{whatsappAliasUrl} • {whatsappStatusAliasUrl}</span>
                      </article>
                    </div>

                    <div className="executive-ols-inline-links">
                      <a
                        href={whatsappClickToChatUrl}
                        className="executive-ols-inline-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open sender in WhatsApp
                      </a>
                      <button
                        type="button"
                        className="executive-ols-inline-link is-button"
                        onClick={() => handleSubmit("Write a short WhatsApp welcome message for a new OneLuxStay guest.")}
                      >
                        Draft welcome copy
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="executive-ols-card-head">
                      <div>
                        <p className="executive-ols-eyebrow">Current context</p>
                        <h3>What the assistant can see</h3>
                        <p>Keep the assistant transparent about the exact data it is summarizing.</p>
                      </div>
                    </div>

                    <div className="executive-ols-context-list">
                      <article className="executive-ols-context-item">
                        <strong>Sync status</strong>
                        <span>{snapshot?.syncStatus?.message || "Waiting for Guesty snapshot."}</span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Current financial view</strong>
                        <span>
                          Revenue {formatCurrency(stats.projectedRevenue, stats.currency || "USD")} • Confirmed{" "}
                          {Number(stats.confirmedReservations || 0)} • Upcoming {Number(stats.upcomingCheckIns || 0)}
                        </span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Property scope</strong>
                        <span>
                          {propertyId
                            ? propertyOptions.find((item) => item.value === propertyId)?.label || "Selected property"
                            : "All properties"}
                        </span>
                      </article>
                      <article className="executive-ols-context-item">
                        <strong>Data source</strong>
                        <span>Guesty listings and reservations, summarized at request time.</span>
                      </article>
                    </div>

                    <div className="executive-ols-inline-links">
                      <Link to="/admins-ols" className="executive-ols-inline-link">
                        Open legacy admin panel
                      </Link>
                      <button type="button" className="executive-ols-inline-link is-button" onClick={() => handleSubmit("Give me the most important executive risks right now.")}>
                        Ask for risks
                      </button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveOlsPage;
