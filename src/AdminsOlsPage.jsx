import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import apiBase from "./utils/apiBase";
import {
  clearAdminsOlsSession,
  getAdminsOlsAuthHeaders,
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
} from "./utils/adminsOlsAuth";
import "./AdminsOlsPage.css";

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

const shortenId = (value = "", start = 6, end = 4) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
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

  const overview = dashboard?.overview || {};
  const system = dashboard?.system || {};
  const rollups = dashboard?.rollups || {};
  const currentAdmin = dashboard?.currentAdmin || session?.user || {};
  const recentSessions = Array.isArray(dashboard?.recentSessions) ? dashboard.recentSessions : [];
  const recentFeedback = Array.isArray(dashboard?.recentFeedback) ? dashboard.recentFeedback : [];
  const recentAssistantMessages = Array.isArray(dashboard?.recentAssistantMessages)
    ? dashboard.recentAssistantMessages
    : [];
  const recentConversations = Array.isArray(dashboard?.recentConversations)
    ? dashboard.recentConversations
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

  const fetchDashboard = async (sessionOverride = session) => {
    if (!sessionOverride?.accessToken && !sessionOverride?.sharedKey) return;

    setLoading(true);
    setError("");
    try {
      const payload = await performAdminRequest({ method: "GET" }, sessionOverride);
      setDashboard(payload);
      setNotice(`Dashboard refreshed ${formatDateTime(payload?.generatedAt)}`);
    } catch (requestError) {
      const message = String(requestError?.message || "Unable to load admin dashboard.");
      setDashboard(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return;
    fetchDashboard(session);
  }, [session?.accessToken, session?.sharedKey]);

  const handleAdminAction = async (payload) => performAdminRequest({ method: "POST", payload });

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

  const handleLogout = () => {
    clearAdminsOlsSession();
    setSession(null);
    setDashboard(null);
    setNotice("");
    setError("");
  };

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/admins-ols/login" replace />;
  }

  return (
    <div className="admins-ols-page">
      <div className="admins-ols-shell">
        <header className="admins-ols-hero">
          <div>
            <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
            <h1>Admin Intelligence Panel</h1>
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
            <button type="button" onClick={() => fetchDashboard()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" className="is-secondary" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </header>

        {notice && <div className="admins-ols-banner">{notice}</div>}
        {error && <div className="admins-ols-error">{error}</div>}

        <section className="admins-ols-grid admins-ols-grid--stats">
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

        <section className="admins-ols-grid admins-ols-grid--two">
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
            </div>
          </article>
        </section>

        <section className="admins-ols-card">
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
                  <div className="admins-ols-thread">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={`${selectedConversation.sessionId}-${message.messageId}`}
                        className={`admins-ols-thread-bubble is-${message.role}`}
                      >
                        <div className="admins-ols-thread-bubble-head">
                          <span className={`admins-ols-badge is-${message.role === "user" ? "neutral" : "positive"}`}>
                            {message.role === "user" ? "Guest" : "Assistant"}
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
                </>
              ) : (
                <p className="admins-ols-empty">Select a conversation to read the thread.</p>
              )}
            </div>
          </div>
        </section>

        <section className="admins-ols-grid admins-ols-grid--two">
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
              {sentimentLessons.map((lesson) => (
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
                    <small>Updated {formatDateTime(lesson.updatedAt)}</small>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="admins-ols-grid admins-ols-grid--two">
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

        <section className="admins-ols-card">
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
                  {item.metadata.responseModel || "Unknown model"} | {item.metadata.city || "Unknown city"} |{" "}
                  {item.metadata.pageType || "Unknown page"}
                </small>
              </article>
            ))}
            {!recentAssistantMessages.length && <p className="admins-ols-empty">No assistant turns found yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminsOlsPage;
