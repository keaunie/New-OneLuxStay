import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import apiBase from "./utils/apiBase";
import {
  clearAdminsOlsSession,
  getAdminsOlsAuthHeaders,
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
} from "./utils/adminsOlsAuth";
import "./AdminsOlsPage.css";

const AUDIT_ACTIVITY_DEDUPE_KEY = "admins-ols-audit-log-opened";
const AUDIT_ACTIVITY_DEDUPE_WINDOW_MS = 5000;
const TAB_TRANSITION_MS = 180;

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatChartDateLabel = (value = "") => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const sanitizeDateInput = (value = "") => String(value || "").trim().slice(0, 16);
const sanitizeDateOnlyInput = (value = "") => String(value || "").trim().slice(0, 10);
const sanitizeTimeOnlyInput = (value = "") => String(value || "").trim().slice(0, 5);

const toDateTimeLocalValue = (date) => {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toIsoIfPossible = (value = "") => {
  const normalized = sanitizeDateInput(value);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
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
  if (normalized === "audit_log_opened") return "Audit Log Opened";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getAdminActivityTone = (item = {}) => {
  const normalized = String(item?.eventType || "").trim().toLowerCase();
  if (["sign_in", "sign_up", "dashboard_opened", "conversation_reply", "lesson_created", "lesson_activated", "audit_log_opened"].includes(normalized)) {
    return "positive";
  }
  if (["lesson_deleted", "lesson_deactivated", "guest_attention_needed"].includes(normalized)) return "negative";
  return "neutral";
};

const getAdminActivityActorLabel = (item = {}) =>
  item?.actorName || item?.actorEmail || "Admin";

const getLessonActorLabel = (actor = {}) => actor?.name || actor?.email || "Unknown admin";

const getAdminActivityMetaLine = (item = {}) => {
  const details = item?.details || {};
  const parts = [];

  if (details.city) parts.push(details.city);
  if (details.pageType) parts.push(String(details.pageType).replace(/\b\w/g, (char) => char.toUpperCase()));
  if (details.lessonTitle) parts.push(details.lessonTitle);
  if (details.sessionId) parts.push(`Session ${String(details.sessionId).slice(0, 8)}`);

  return parts.join(" | ");
};

const splitDateTimeLocalValue = (value = "") => {
  const normalized = sanitizeDateInput(value);
  if (!normalized) {
    return { date: "", time: "" };
  }

  const [datePart = "", timePart = ""] = normalized.split("T");
  return {
    date: sanitizeDateOnlyInput(datePart),
    time: sanitizeTimeOnlyInput(timePart),
  };
};

const combineDateAndTime = (date = "", time = "", fallbackTime = "00:00") => {
  const normalizedDate = sanitizeDateOnlyInput(date);
  if (!normalizedDate) return "";
  const normalizedTime = sanitizeTimeOnlyInput(time) || fallbackTime;
  return `${normalizedDate}T${normalizedTime}`;
};

const buildDefaultFilters = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startValue = toDateTimeLocalValue(start);
  const endValue = toDateTimeLocalValue(end);
  const startParts = splitDateTimeLocalValue(startValue);
  const endParts = splitDateTimeLocalValue(endValue);

  return {
    actorName: "",
    startDate: startParts.date,
    startTime: startParts.time,
    endDate: endParts.date,
    endTime: endParts.time,
  };
};

const AUDIT_TAB_ITEMS = [
  { id: "filters", label: "Filters" },
  { id: "summary", label: "Summary" },
  { id: "lessons-entry", label: "Lessons Entry" },
  { id: "audit-entries", label: "Audit Entries" },
];

const shouldLogAuditOpen = () => {
  if (typeof window === "undefined" || !window.sessionStorage) return true;

  try {
    const previous = Number(window.sessionStorage.getItem(AUDIT_ACTIVITY_DEDUPE_KEY) || 0);
    const now = Date.now();
    if (Number.isFinite(previous) && previous > 0 && now - previous < AUDIT_ACTIVITY_DEDUPE_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(AUDIT_ACTIVITY_DEDUPE_KEY, String(now));
    return true;
  } catch {
    return true;
  }
};

function AdminsOlsAuditPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadAdminsOlsSession());
  const [currentAdmin, setCurrentAdmin] = useState(() => session?.user || {});
  const [filters, setFilters] = useState(() => buildDefaultFilters());
  const [activity, setActivity] = useState([]);
  const [lessonEntries, setLessonEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessState, setAccessState] = useState(() =>
    session?.accessToken || session?.sharedKey ? "checking" : "signed_out",
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState("filters");
  const [displayedTabId, setDisplayedTabId] = useState("filters");
  const [tabContentPhase, setTabContentPhase] = useState("idle");
  const tabTransitionTimeoutRef = useRef(null);

  const isSuperAdmin = currentAdmin?.isSuperAdmin === true;
  const signInChartData = useMemo(() => {
    const grouped = new Map();

    activity.forEach((item) => {
      if (String(item?.eventType || "").trim().toLowerCase() !== "sign_in") return;
      const parsed = new Date(item.createdAt || "");
      if (Number.isNaN(parsed.getTime())) return;

      const bucketKey = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).toISOString();
      const existing = grouped.get(bucketKey) || {
        key: bucketKey,
        label: formatChartDateLabel(parsed),
        count: 0,
      };
      existing.count += 1;
      grouped.set(bucketKey, existing);
    });

    const points = [...grouped.values()]
      .sort((left, right) => new Date(left.key).getTime() - new Date(right.key).getTime())
      .slice(-14);

    const maxCount = points.reduce((max, item) => Math.max(max, item.count), 0);

    return points.map((item) => ({
      ...item,
      heightPercent: maxCount > 0 ? Math.max(12, Math.round((item.count / maxCount) * 100)) : 0,
    }));
  }, [activity]);

  const lessonEntryLeaderboard = useMemo(() => {
    const grouped = new Map();

    lessonEntries.forEach((entry) => {
      const actorLabel = getLessonActorLabel(entry?.createdBy);
      const actorKey = String(
        entry?.createdBy?.email || entry?.createdBy?.id || actorLabel || "unknown",
      ).toLowerCase();
      const existing = grouped.get(actorKey) || {
        actorKey,
        actorLabel,
        lessonsCount: 0,
        latestEntryAt: "",
      };
      existing.lessonsCount += 1;
      const createdAt = String(entry?.createdAt || "");
      if (
        createdAt &&
        (!existing.latestEntryAt ||
          (Date.parse(createdAt) || 0) > (Date.parse(existing.latestEntryAt) || 0))
      ) {
        existing.latestEntryAt = createdAt;
      }
      grouped.set(actorKey, existing);
    });

    return [...grouped.values()].sort(
      (left, right) =>
        right.lessonsCount - left.lessonsCount ||
        (Date.parse(right.latestEntryAt) || 0) - (Date.parse(left.latestEntryAt) || 0) ||
        left.actorLabel.localeCompare(right.actorLabel),
    );
  }, [lessonEntries]);

  const lessonEntrySummary = useMemo(() => {
    const activeLessons = lessonEntries.filter((entry) => entry?.active).length;
    const uniqueCreators = new Set(
      lessonEntries.map((entry) => getLessonActorLabel(entry?.createdBy)).filter(Boolean),
    ).size;
    const uniqueSubmitters = new Set(
      lessonEntries
        .map((entry) => getLessonActorLabel(entry?.updatedBy || entry?.createdBy))
        .filter(Boolean),
    ).size;

    return {
      totalLessons: lessonEntries.length,
      activeLessons,
      uniqueCreators,
      uniqueSubmitters,
    };
  }, [lessonEntries]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Superadmin Audit";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => () => {
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
      if (!session?.accessToken && !session?.sharedKey) {
        setAccessState("signed_out");
        return;
      }

      if (session?.sharedKey) {
        setAccessState("authorized");
        return;
      }

      if (!isAdminsOlsSessionExpired(session)) return;

      const refreshed = await refreshAdminsOlsSession(apiBase, session).catch(() => null);
      if (!active) return;
      if (refreshed?.accessToken || refreshed?.sharedKey) {
        setSession(refreshed);
        setCurrentAdmin(refreshed?.user || {});
        setAccessState(refreshed?.user?.isSuperAdmin || refreshed?.sharedKey ? "authorized" : "checking");
        return;
      }

      clearAdminsOlsSession();
      setSession(null);
      setAccessState("signed_out");
    };

    ensureFreshSession();

    return () => {
      active = false;
    };
  }, [session]);

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
        setCurrentAdmin(refreshedSession?.user || {});
        response = await buildRequest(refreshedSession);
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        clearAdminsOlsSession();
        setSession(null);
        setAccessState("signed_out");
      }
      if (response.status === 403) {
        setAccessState("forbidden");
      }
      throw new Error(data?.error || "Admin request failed.");
    }

    return data;
  };

  const fetchAuditActivity = async ({ silent = false } = {}) => {
    if (!session?.accessToken && !session?.sharedKey) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const startAt = combineDateAndTime(filters.startDate, filters.startTime);
      const endAt = combineDateAndTime(filters.endDate, filters.endTime);
      const payload = await performAdminRequest({
        method: "POST",
        payload: {
          action: "get_admin_activity",
          actorName: filters.actorName,
          startAt: toIsoIfPossible(startAt),
          endAt: toIsoIfPossible(endAt),
          limit: 100,
        },
      });

      setActivity(Array.isArray(payload?.activity) ? payload.activity : []);
      setLessonEntries(Array.isArray(payload?.lessonEntries) ? payload.lessonEntries : []);
      setCurrentAdmin((current) => payload?.currentAdmin || current);
      setAccessState("authorized");
      if (!silent) {
        setNotice("Audit log refreshed.");
      }
    } catch (requestError) {
      const message = String(requestError?.message || "Unable to load audit log.");
      if (/superadmin access required/i.test(message)) {
        setAccessState("forbidden");
      }
      setError(message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return;
    setAccessState((current) => (current === "authorized" ? current : "checking"));
    fetchAuditActivity();
  }, [session?.accessToken, session?.sharedKey]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!shouldLogAuditOpen()) return;
    performAdminRequest({
      method: "POST",
      payload: {
        action: "log_activity",
        eventType: "audit_log_opened",
        message: "Opened the superadmin audit log page.",
        details: {
          source: "audit_page",
        },
      },
    }).catch(() => null);
  }, [isSuperAdmin]);

  const handleFilterChange = (field) => (event) => {
    const nextValue = event.target.value;
    setFilters((current) => ({ ...current, [field]: nextValue }));
  };

  const handleApplyFilters = async (event) => {
    event.preventDefault();
    const startAt = combineDateAndTime(filters.startDate, filters.startTime);
    const endAt = combineDateAndTime(filters.endDate, filters.endTime);

    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
      setError("Start date must be before the end date.");
      return;
    }
    await fetchAuditActivity();
  };

  const handleResetFilters = async () => {
    const defaults = buildDefaultFilters();
    setFilters(defaults);
    setError("");
    setNotice("");

    if (!session?.accessToken && !session?.sharedKey) return;

    setLoading(true);
    try {
      const payload = await performAdminRequest({
        method: "POST",
        payload: {
          action: "get_admin_activity",
          actorName: defaults.actorName,
          startAt: toIsoIfPossible(combineDateAndTime(defaults.startDate, defaults.startTime)),
          endAt: toIsoIfPossible(combineDateAndTime(defaults.endDate, defaults.endTime)),
          limit: 100,
        },
      });
      setActivity(Array.isArray(payload?.activity) ? payload.activity : []);
      setLessonEntries(Array.isArray(payload?.lessonEntries) ? payload.lessonEntries : []);
      setCurrentAdmin((current) => payload?.currentAdmin || current);
      setNotice("Audit filters reset to the last 7 days.");
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to reset audit filters."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminsOlsSession();
    setSession(null);
    navigate("/executive-ols/login", { replace: true });
  };

  const handleNavigateToTab = (tabId = "") => {
    if (!tabId) return;
    setActiveTabId(tabId);
    setIsSidebarOpen(false);
  };

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/executive-ols/login" replace />;
  }

  if (accessState === "forbidden") {
    return <Navigate to="/executive-ols" replace />;
  }

  if (accessState === "checking" && !isSuperAdmin) {
    return (
      <div className="admins-ols-page">
        <div className="admins-ols-shell">
          <section className="admins-ols-lockup">
            <p className="admins-ols-eyebrow">OneLuxStay Executive</p>
            <h1>Checking Audit Access</h1>
            <p className="admins-ols-hero-copy">
              Verifying your superadmin permissions before loading the audit log.
            </p>
          </section>
        </div>
      </div>
    );
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
            aria-controls="admins-ols-audit-sidebar"
          >
            {isSidebarOpen ? "Close Panel" : "Open Panel"}
          </button>
          <div>
            <strong>Audit Navigation</strong>
            <small>Dashboard return, page sections, and audit access</small>
          </div>
        </div>

        <div className={`admins-ols-layout${isSidebarOpen ? " is-sidebar-open" : ""}`}>
          <aside
            id="admins-ols-audit-sidebar"
            className="admins-ols-sidebar"
            aria-label="Audit navigation"
          >
            <div className="admins-ols-side-sticky">
              <section className="admins-ols-side-section">
                <p className="admins-ols-eyebrow">Executive Access</p>
                <h2>{currentAdmin.fullName || currentAdmin.email || "Superadmin"}</h2>
                <p className="admins-ols-note">
                  Signed in with {session?.sharedKey ? "shared key access" : "Supabase authentication"}.
                </p>
              </section>

              <section className="admins-ols-side-section">
                <div className="admins-ols-card-head">
                  <h3>Quick Jump</h3>
                </div>
                <div className="admins-ols-side-nav">
                  <Link className="admins-ols-side-nav-link" to="/executive-ols">
                    <span>Back to Dashboard</span>
                  </Link>
                  <button
                    type="button"
                    className={activeTabId === "filters" ? "is-current" : ""}
                    onClick={() => handleNavigateToTab("filters")}
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    className={activeTabId === "summary" ? "is-current" : ""}
                    onClick={() => handleNavigateToTab("summary")}
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    className={activeTabId === "lessons-entry" ? "is-current" : ""}
                    onClick={() => handleNavigateToTab("lessons-entry")}
                  >
                    Lessons Entry
                    <span className="admins-ols-side-nav-count">{lessonEntries.length}</span>
                  </button>
                  <button
                    type="button"
                    className={activeTabId === "audit-entries" ? "is-current" : ""}
                    onClick={() => handleNavigateToTab("audit-entries")}
                  >
                    Audit Entries
                  </button>
                  <span className="admins-ols-side-nav-link is-current" aria-current="page">
                    <span>Superadmin Audit Log</span>
                    <span className="admins-ols-side-nav-count">{activity.length}</span>
                  </span>
                </div>
              </section>
            </div>
          </aside>

          <main className="admins-ols-main">
            <header className="admins-ols-hero">
              <div className="admins-ols-hero-content">
                <p className="admins-ols-eyebrow">OneLuxStay Executive</p>
                <h1>Superadmin Audit Log</h1>
                <p className="admins-ols-hero-copy">
                  Review sensitive admin access history with exact date and time filters.
                </p>
                <p className="admins-ols-note">
                  Signed in as <strong>{currentAdmin.fullName || currentAdmin.email || "Superadmin"}</strong>
                  {currentAdmin.email ? ` (${currentAdmin.email})` : ""}
                </p>
              </div>
              <div className="admins-ols-toolbar">
                <button type="button" onClick={() => fetchAuditActivity()} disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
                <button type="button" className="is-secondary" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            </header>

            {notice && <div className="admins-ols-banner">{notice}</div>}
            {error && <div className="admins-ols-error">{error}</div>}

            <section className="admins-ols-card admins-ols-tabs-card" aria-label="Superadmin audit tabs">
              <div className="admins-ols-tablist" role="tablist" aria-label="Superadmin audit sections">
                {AUDIT_TAB_ITEMS.map((item) => (
                  <button
                    key={`audit-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={activeTabId === item.id}
                    aria-controls={`audit-panel-${item.id}`}
                    id={`audit-tab-${item.id}`}
                    className={`admins-ols-tab${activeTabId === item.id ? " is-active" : ""}`}
                    onClick={() => handleNavigateToTab(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.id === "lessons-entry" && (
                      <span className="admins-ols-side-nav-count">{lessonEntries.length}</span>
                    )}
                    {item.id === "audit-entries" && (
                      <span className="admins-ols-side-nav-count">{activity.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <div className={`admins-ols-tab-panels ${tabContentPhase}`}>
              <section
                id="audit-panel-filters"
                role="tabpanel"
                aria-labelledby="audit-tab-filters"
                hidden={displayedTabId !== "filters"}
                className="admins-ols-grid admins-ols-grid--two"
              >
                <article className="admins-ols-card">
                  <div className="admins-ols-card-head">
                    <h2>Filters</h2>
                  </div>
                  <form className="admins-ols-form" onSubmit={handleApplyFilters}>
                    <label>
                      Admin name
                      <input
                        type="text"
                        value={filters.actorName}
                        onChange={handleFilterChange("actorName")}
                        placeholder="Filter by admin name"
                        autoComplete="off"
                      />
                    </label>
                    <div className="admins-ols-filter-group">
                      <span className="admins-ols-filter-group-label">Start</span>
                      <div className="admins-ols-filter-row">
                        <label>
                          Date
                          <input
                            type="date"
                            value={filters.startDate}
                            onChange={handleFilterChange("startDate")}
                            aria-label="Start date"
                          />
                        </label>
                        <label>
                          Time
                          <input
                            type="time"
                            value={filters.startTime}
                            onChange={handleFilterChange("startTime")}
                            aria-label="Start time"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="admins-ols-filter-group">
                      <span className="admins-ols-filter-group-label">End</span>
                      <div className="admins-ols-filter-row">
                        <label>
                          Date
                          <input
                            type="date"
                            value={filters.endDate}
                            onChange={handleFilterChange("endDate")}
                            aria-label="End date"
                          />
                        </label>
                        <label>
                          Time
                          <input
                            type="time"
                            value={filters.endTime}
                            onChange={handleFilterChange("endTime")}
                            aria-label="End time"
                          />
                        </label>
                      </div>
                    </div>
                    <button type="submit" disabled={loading}>
                      {loading ? "Loading..." : "Apply Filters"}
                    </button>
                    <button type="button" className="is-secondary" disabled={loading} onClick={handleResetFilters}>
                      Reset to Last 7 Days
                    </button>
                  </form>
                </article>

                <article className="admins-ols-card admins-ols-stat">
                  <span>Visible audit events</span>
                  <strong>{activity.length}</strong>
                  <small>Filtered superadmin activity entries in the selected date range</small>
                  <div className="admins-ols-chart-card">
                    <div className="admins-ols-chart-head">
                      <h3>Admin Logins By Date</h3>
                      <span className="admins-ols-pill">{signInChartData.length} days</span>
                    </div>
                    {signInChartData.length ? (
                      <div className="admins-ols-bar-chart" aria-label="Bar chart of admin logins by date">
                        {signInChartData.map((item) => (
                          <div key={item.key} className="admins-ols-bar-chart-item">
                            <div className="admins-ols-bar-chart-value">{item.count}</div>
                            <div className="admins-ols-bar-chart-track">
                              <div
                                className="admins-ols-bar-chart-bar"
                                style={{ height: `${item.heightPercent}%` }}
                                title={`${item.label}: ${item.count} logins`}
                              />
                            </div>
                            <div className="admins-ols-bar-chart-label">{item.label}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="admins-ols-empty">No sign-in events in this filtered range yet.</p>
                    )}
                  </div>
                </article>
              </section>

              <section
                id="audit-panel-summary"
                role="tabpanel"
                aria-labelledby="audit-tab-summary"
                hidden={displayedTabId !== "summary"}
                className="admins-ols-grid admins-ols-grid--two"
              >
                <article className="admins-ols-card admins-ols-stat">
                  <span>Visible audit events</span>
                  <strong>{activity.length}</strong>
                  <small>Filtered superadmin activity entries in the selected date range</small>
                </article>
                <article className="admins-ols-card">
                  <div className="admins-ols-card-head">
                    <h2>Admin Logins By Date</h2>
                    <span className="admins-ols-pill">{signInChartData.length} days</span>
                  </div>
                  {signInChartData.length ? (
                    <div className="admins-ols-bar-chart" aria-label="Bar chart of admin logins by date">
                      {signInChartData.map((item) => (
                        <div key={item.key} className="admins-ols-bar-chart-item">
                          <div className="admins-ols-bar-chart-value">{item.count}</div>
                          <div className="admins-ols-bar-chart-track">
                            <div
                              className="admins-ols-bar-chart-bar"
                              style={{ height: `${item.heightPercent}%` }}
                              title={`${item.label}: ${item.count} logins`}
                            />
                          </div>
                          <div className="admins-ols-bar-chart-label">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="admins-ols-empty">No sign-in events in this filtered range yet.</p>
                  )}
                </article>
              </section>

              <section
                id="audit-panel-lessons-entry"
                role="tabpanel"
                aria-labelledby="audit-tab-lessons-entry"
                hidden={displayedTabId !== "lessons-entry"}
                className="admins-ols-card"
              >
                <div className="admins-ols-card-head">
                  <h2>Lessons Entry</h2>
                  <span className="admins-ols-pill">{lessonEntries.length} lessons</span>
                </div>

                <div className="admins-ols-grid admins-ols-grid--two">
                  <article className="admins-ols-card admins-ols-card--nested">
                    <div className="admins-ols-card-head">
                      <h3>Lesson Overview</h3>
                    </div>
                    <dl className="admins-ols-definition-list">
                      <div>
                        <dt>Total lesson entries</dt>
                        <dd>{lessonEntrySummary.totalLessons}</dd>
                      </div>
                      <div>
                        <dt>Active lessons</dt>
                        <dd>{lessonEntrySummary.activeLessons}</dd>
                      </div>
                      <div>
                        <dt>Admins who entered lessons</dt>
                        <dd>{lessonEntrySummary.uniqueCreators}</dd>
                      </div>
                      <div>
                        <dt>Admins who submitted updates</dt>
                        <dd>{lessonEntrySummary.uniqueSubmitters}</dd>
                      </div>
                    </dl>
                  </article>

                  <article className="admins-ols-card admins-ols-card--nested">
                    <div className="admins-ols-card-head">
                      <h3>Most Lessons Entered</h3>
                      <span className="admins-ols-pill">{lessonEntryLeaderboard.length} admins</span>
                    </div>
                    {lessonEntryLeaderboard.length ? (
                      <div className="admins-ols-table-wrap">
                        <table className="admins-ols-table">
                          <thead>
                            <tr>
                              <th>Admin</th>
                              <th>Lessons Entered</th>
                              <th>Latest Entry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lessonEntryLeaderboard.map((entry) => (
                              <tr key={entry.actorKey}>
                                <td>{entry.actorLabel}</td>
                                <td>{entry.lessonsCount}</td>
                                <td>{formatDateTime(entry.latestEntryAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="admins-ols-empty">No lesson entries in this filtered range yet.</p>
                    )}
                  </article>
                </div>

                <div className="admins-ols-card-head admins-ols-subsection-head">
                  <h3>Lesson Entry Details</h3>
                  <span className="admins-ols-pill">{lessonEntries.length} rows</span>
                </div>
                {lessonEntries.length ? (
                  <div className="admins-ols-table-wrap">
                    <table className="admins-ols-table">
                      <thead>
                        <tr>
                          <th>Lesson</th>
                          <th>Sentiment</th>
                          <th>Entered By</th>
                          <th>Submitted By</th>
                          <th>Created</th>
                          <th>Updated</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lessonEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.title || "Untitled lesson"}</td>
                            <td>{entry.sentimentLabel || "Unknown"}</td>
                            <td>{getLessonActorLabel(entry.createdBy)}</td>
                            <td>{getLessonActorLabel(entry.updatedBy || entry.createdBy)}</td>
                            <td>{formatDateTime(entry.createdAt)}</td>
                            <td>{formatDateTime(entry.updatedAt)}</td>
                            <td>{entry.active ? "Active" : "Inactive"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="admins-ols-empty">No lesson entries match this filter yet.</p>
                )}
              </section>

              <section
                id="audit-panel-audit-entries"
                role="tabpanel"
                aria-labelledby="audit-tab-audit-entries"
                hidden={displayedTabId !== "audit-entries"}
                className="admins-ols-card"
              >
                <div className="admins-ols-card-head">
                  <h2>Audit Entries</h2>
                  <span className="admins-ols-pill">{activity.length} rows</span>
                </div>
                <div className="admins-ols-stack">
                  {activity.map((item) => (
                    <article key={item.id || `${item.eventType}-${item.createdAt}`} className="admins-ols-log">
                      <div className="admins-ols-log-meta">
                        <span className={`admins-ols-badge is-${getAdminActivityTone(item)}`}>
                          {formatAdminActivityEventLabel(item.eventType)}
                        </span>
                        <small>{formatDateTime(item.createdAt)}</small>
                      </div>
                      <p><strong>{getAdminActivityActorLabel(item)}</strong></p>
                      <p>{item.message || formatAdminActivityEventLabel(item.eventType)}</p>
                      <small>{getAdminActivityMetaLine(item) || item.authMode || "No additional details"}</small>
                    </article>
                  ))}
                  {!activity.length && <p className="admins-ols-empty">No audit entries in that date range yet.</p>}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminsOlsAuditPage;
