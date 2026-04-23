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

  const stats = snapshot?.stats || {};
  const propertyOptions = Array.isArray(snapshot?.propertyOptions) ? snapshot.propertyOptions : [];
  const reservations = Array.isArray(snapshot?.reservations) ? snapshot.reservations : [];
  const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
  const syncStatusTone = snapshot?.syncStatus?.ok ? "is-positive" : "is-negative";
  const heroEyebrow = activeView === "whatsapp" ? "WhatsApp concierge" : "AI Assistant";
  const heroTitle =
    activeView === "whatsapp"
      ? "Deploy Lucy on WhatsApp with Twilio."
      : "Ask direct questions about revenue, bookings, and issues.";
  const heroCopy =
    activeView === "whatsapp"
      ? "This setup uses the live Lucy chat brain, a Twilio webhook, and saved conversation history by guest phone number."
      : "The executive assistant uses Guesty-backed snapshot data and stays explicit when something cannot be verified live.";
  const whatsappWebhookUrl = `${siteOrigin}/.netlify/functions/whatsapp-webhook`;
  const whatsappStatusUrl = `${siteOrigin}/.netlify/functions/whatsapp-status`;
  const whatsappAliasUrl = `${siteOrigin}/api/whatsapp`;
  const whatsappStatusAliasUrl = `${siteOrigin}/api/whatsapp-status`;
  const whatsappClickToChatUrl = `https://wa.me/${WHATSAPP_SENDER_E164.replace(/[^\d]/g, "")}`;

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
                        <h3>Twilio setup and bot preview</h3>
                        <p>Paste these values into the Twilio WhatsApp Sender page, then message Lucy from your phone.</p>
                      </div>
                    </div>

                    <div className="executive-ols-prompt-list">
                      {WHATSAPP_TEST_PROMPTS.map((prompt) => (
                        <button key={prompt} type="button" className="executive-ols-prompt" onClick={() => handleSubmit(prompt)}>
                          {prompt}
                        </button>
                      ))}
                    </div>

                    <div className="executive-ols-whatsapp-grid">
                      <article className="executive-ols-list-card">
                        <strong>Incoming webhook URL</strong>
                        <code className="executive-ols-code-block">{whatsappWebhookUrl}</code>
                        <small>Use `HTTP POST` in Twilio. The direct function URL is the safest option for signature checks.</small>
                      </article>

                      <article className="executive-ols-list-card">
                        <strong>Status callback URL</strong>
                        <code className="executive-ols-code-block">{whatsappStatusUrl}</code>
                        <small>Optional, but ready if you want Twilio delivery logs for outbound API sends later.</small>
                      </article>

                      <article className="executive-ols-list-card">
                        <strong>Business profile copy</strong>
                        <span>Display name: {WHATSAPP_DISPLAY_NAME}</span>
                        <span>Email: {WHATSAPP_BUSINESS_EMAIL}</span>
                        <span>Website: {WHATSAPP_PRIMARY_WEBSITE}</span>
                        <span>Additional website: {WHATSAPP_SECONDARY_WEBSITE}</span>
                        <span>Vertical: Hotel and Lodging</span>
                        <small>Description ({WHATSAPP_BUSINESS_DESCRIPTION.length}/256): {WHATSAPP_BUSINESS_DESCRIPTION}</small>
                        <small>About ({WHATSAPP_PROFILE_ABOUT.length}/139): {WHATSAPP_PROFILE_ABOUT}</small>
                      </article>

                      <article className="executive-ols-list-card">
                        <strong>Guest experience</strong>
                        <span>Lucy can answer availability, booking status, listing questions, and reservation guidance.</span>
                        <span>Conversation history is saved by phone number so follow-ups keep context.</span>
                        <small>Sender number: {WHATSAPP_SENDER_E164}</small>
                      </article>
                    </div>

                    <div className="executive-ols-whatsapp-preview" aria-label="WhatsApp preview">
                      <article className="executive-ols-message executive-ols-message--user">
                        <span className="executive-ols-message-role">Guest</span>
                        <p>Hi Lucy, can you check Miami for 2 guests from 2026-05-10 to 2026-05-13?</p>
                      </article>
                      <article className="executive-ols-message executive-ols-message--assistant">
                        <span className="executive-ols-message-role">Lucy</span>
                        <p>
                          I can help with that. I&apos;ll check live availability for Miami and send the best matching options
                          with booking links right in WhatsApp.
                        </p>
                      </article>
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
