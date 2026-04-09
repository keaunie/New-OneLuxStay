import { useEffect, useMemo, useState } from "react";
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
  if (["lesson_deleted", "lesson_deactivated"].includes(normalized)) return "negative";
  return "neutral";
};

const getAdminActivityActorLabel = (item = {}) =>
  item?.actorName || item?.actorEmail || "Admin";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessState, setAccessState] = useState(() =>
    session?.accessToken || session?.sharedKey ? "checking" : "signed_out",
  );

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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Superadmin Audit";
    return () => {
      document.title = previousTitle;
    };
  }, []);

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
    navigate("/admins-ols/login", { replace: true });
  };

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/admins-ols/login" replace />;
  }

  if (accessState === "forbidden") {
    return <Navigate to="/admins-ols" replace />;
  }

  if (accessState === "checking" && !isSuperAdmin) {
    return (
      <div className="admins-ols-page">
        <div className="admins-ols-shell">
          <section className="admins-ols-lockup">
            <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
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
        <header className="admins-ols-hero">
          <div className="admins-ols-hero-content">
            <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
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

        <section className="admins-ols-grid admins-ols-grid--two">
          <article className="admins-ols-card">
            <div className="admins-ols-card-head">
              <h2>Filters</h2>
              <Link className="admins-ols-inline-link" to="/admins-ols">
                Back to Dashboard
              </Link>
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

        <section className="admins-ols-card">
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
    </div>
  );
}

export default AdminsOlsAuditPage;
