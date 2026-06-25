import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAdminPresence } from "./hooks/useAdminPresence";
import {
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
} from "./utils/adminsOlsAuth";
import apiBase from "./utils/apiBase";
import { userHasSuperAdminRole } from "../shared/adminRoles.js";
import "./AdminPresencePage.css";

const LOG_PREFIX = "[Admin Presence Page]";
const DEBUG_PRESENCE_PAGE =
  String(import.meta.env.VITE_ADMIN_PRESENCE_DEBUG || "")
    .trim()
    .toLowerCase() === "true";

const logPresencePage = (stage = "", detail = {}) => {
  if (!DEBUG_PRESENCE_PAGE) return;
  console.log(`${LOG_PREFIX} ${stage}`, detail);
};

const logPresencePageError = (stage = "", error = null, detail = {}) => {
  console.error(`${LOG_PREFIX} ${stage}`, {
    ...detail,
    error,
    message: error?.message || "",
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || "",
    status: error?.status || error?.statusCode || "",
  });
};

const getPageSessionDiagnostics = (session = null) => ({
  sessionExists: Boolean(session),
  hasAccessToken: Boolean(session?.accessToken),
  accessTokenLength: String(session?.accessToken || "").length,
  hasRefreshToken: Boolean(session?.refreshToken),
  hasSharedKey: Boolean(session?.sharedKey),
  databaseRole: session?.databaseRole || "",
  expiresAt: session?.expiresAt || "",
  userId: session?.user?.id || "",
  email: session?.user?.email || "",
  role: session?.user?.role || "",
  isSuperAdmin: session?.user?.isSuperAdmin === true,
});

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatRelative = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "Unknown";
  const delta = Date.now() - parsed;
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};

const formatDuration = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "--";
  let seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getStatusLabel = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "online") return "ONLINE";
  if (normalized === "away") return "AWAY";
  return "OFFLINE";
};

const STATUS_SORT_ORDER = {
  online: 0,
  away: 1,
  offline: 2,
};

const PAGE_LABELS = [
  [/^\/executive-ols\/admin-presence/i, "Live Admin Monitor"],
  [/^\/executive-ols\/guest-journeys/i, "Guest Journeys"],
  [/^\/executive-ols\/conversations/i, "Conversations"],
  [/^\/executive-ols\/chat\//i, "Guest Chat"],
  [/^\/executive-ols\/whatsapp/i, "WhatsApp Inbox"],
  [/^\/executive-ols\/calls/i, "Calls"],
  [/^\/executive-ols\/audit/i, "Audit Center"],
  [/^\/executive-ols\/blog/i, "Blog Admin"],
  [/^\/executive-ols\/?$/i, "Executive Dashboard"],
  [/^\/admin-reservations/i, "Reservations"],
  [/^\/dev-ols\/config/i, "System Config"],
  [/^\/ai-agent/i, "AI Agent Console"],
];

const toTitleCase = (value = "") =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getFriendlyPageName = (path = "") => {
  const normalized = String(path || "/").split("?")[0] || "/";
  const matched = PAGE_LABELS.find(([pattern]) => pattern.test(normalized));
  if (matched) return matched[1];
  if (normalized === "/") return "Website Home";
  const segment = normalized.split("/").filter(Boolean).at(-1);
  return segment ? toTitleCase(segment) : normalized;
};

const getDeviceLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "mobile") return "Mobile";
  if (normalized === "tablet") return "Tablet";
  return "Desktop";
};

const getStatusSortValue = (status = "") => STATUS_SORT_ORDER[String(status || "").toLowerCase()] ?? 3;

const getRowTime = (row = {}) => {
  const parsed = Date.parse(String(row?.last_active_at || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAdminGroupKey = (row = {}) =>
  String(row?.admin_id || row?.email || row?.session_id || row?.id || "unknown").trim().toLowerCase();

const getAdminDisplayName = (row = {}) => String(row?.full_name || row?.email || "Admin").trim();

const buildAdminGroups = (rows = []) => {
  const groups = new Map();

  rows.forEach((row) => {
    const key = getAdminGroupKey(row);
    const current = groups.get(key) || {
      key,
      name: getAdminDisplayName(row),
      email: String(row?.email || "").trim(),
      role: String(row?.role || "admin").trim(),
      sessions: [],
    };

    current.sessions.push({
      ...row,
      friendly_page: getFriendlyPageName(row?.current_path || "/"),
      device_label: getDeviceLabel(row?.device_type),
      computed_status: String(row?.computed_status || row?.status || "offline").toLowerCase(),
    });
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((group) => {
      const sessions = group.sessions.sort((left, right) => {
        const statusDelta = getStatusSortValue(left.computed_status) - getStatusSortValue(right.computed_status);
        if (statusDelta) return statusDelta;
        return getRowTime(right) - getRowTime(left);
      });
      const primary = sessions[0] || {};
      const devices = [...new Set(sessions.map((row) => row.device_label).filter(Boolean))];
      const activeSessions = sessions.filter((row) => row.computed_status !== "offline");

      return {
        ...group,
        name: getAdminDisplayName(primary) || group.name,
        email: String(primary?.email || group.email || "").trim(),
        role: String(primary?.role || group.role || "admin").trim(),
        status: primary.computed_status || "offline",
        currentPage: primary.friendly_page || "Unknown",
        lastActiveAt: primary.last_active_at || "",
        devices,
        sessions,
        activeSessionCount: activeSessions.length,
      };
    })
    .sort((left, right) => {
      const statusDelta = getStatusSortValue(left.status) - getStatusSortValue(right.status);
      if (statusDelta) return statusDelta;
      return getRowTime({ last_active_at: right.lastActiveAt }) - getRowTime({ last_active_at: left.lastActiveAt });
    });
};

const getInitials = (row = {}) => {
  const fullName = String(row?.full_name || "").trim();
  if (fullName) {
    const words = fullName.split(/\s+/).filter(Boolean).slice(0, 2);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  const email = String(row?.email || "").trim();
  return email ? email.slice(0, 2).toUpperCase() : "AD";
};

function AdminPresencePage() {
  const location = useLocation();
  const [session, setSession] = useState(() => loadAdminsOlsSession());
  const [authChecking, setAuthChecking] = useState(true);
  const initialPathRef = useRef(`${location.pathname || "/"}${location.search || ""}`);
  const initialSessionRef = useRef(session);

  useEffect(() => {
    logPresencePage("mounted", {
      path: initialPathRef.current,
      initialSession: getPageSessionDiagnostics(initialSessionRef.current),
    });
    const previousTitle = document.title;
    document.title = "OneLuxStay Live Admin Presence";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.adminPresence = "true";
    document.head.appendChild(robotsMeta);

    return () => {
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const loaded = loadAdminsOlsSession();
      logPresencePage("session loaded", getPageSessionDiagnostics(loaded));
      if (!loaded?.accessToken && !loaded?.sharedKey) {
        if (active) {
          logPresencePage("session missing; redirecting to login");
          setSession(null);
          setAuthChecking(false);
        }
        return;
      }

      if (loaded?.accessToken && isAdminsOlsSessionExpired(loaded)) {
        logPresencePage("session expired; refreshing", getPageSessionDiagnostics(loaded));
        const refreshed = await refreshAdminsOlsSession(apiBase, loaded).catch((error) => {
          logPresencePageError("session refresh failed", error, getPageSessionDiagnostics(loaded));
          return null;
        });
        logPresencePage("session refresh result", getPageSessionDiagnostics(refreshed));
        if (active) {
          setSession(refreshed || null);
          setAuthChecking(false);
        }
        return;
      }

      if (active) {
        logPresencePage("session accepted", getPageSessionDiagnostics(loaded));
        setSession(loaded);
        setAuthChecking(false);
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const currentPath = useMemo(
    () => `${location.pathname || "/"}${location.search || ""}`,
    [location.pathname, location.search],
  );

  const {
    rows,
    loading,
    error,
    lastSyncedAt,
    refreshNow,
    hasRealtime,
  } = useAdminPresence({
    session,
    enabled: !authChecking,
    currentPath,
  });

  const isSuperAdmin = userHasSuperAdminRole(session?.user || {});
  const adminGroups = useMemo(() => buildAdminGroups(rows), [rows]);
  const onlineGroups = useMemo(() => adminGroups.filter((group) => group.status === "online"), [adminGroups]);
  const awayGroups = useMemo(() => adminGroups.filter((group) => group.status === "away"), [adminGroups]);
  const offlineGroups = useMemo(() => adminGroups.filter((group) => group.status === "offline"), [adminGroups]);
  const activeSessionCount = useMemo(
    () => rows.filter((row) => String(row?.computed_status || "").toLowerCase() !== "offline").length,
    [rows],
  );
  const activeAdminCount = onlineGroups.length + awayGroups.length;

  if (!authChecking && !session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/executive-ols/login?next=%2Fexecutive-ols%2Fadmin-presence" replace />;
  }

  if (!authChecking && !isSuperAdmin) {
    return <Navigate to="/executive-ols" replace />;
  }

  const renderAdminGroup = (group, { compact = false } = {}) => {
    const visibleSessions = compact ? group.sessions.slice(0, 2) : group.sessions;
    return (
      <article key={group.key} className={`admin-presence-admin is-${group.status}`}>
        <div className="admin-presence-admin-main">
          <div className="admin-presence-avatar">{getInitials(group.sessions[0] || {})}</div>
          <div className="admin-presence-identity">
            <h2>{group.name || "Admin"}</h2>
            <p>{group.email || "No email"}</p>
          </div>
          <span className={`admin-presence-status is-${group.status}`}>{getStatusLabel(group.status)}</span>
        </div>

        <div className="admin-presence-admin-summary">
          <div>
            <span>Current page</span>
            <strong>{group.currentPage}</strong>
          </div>
          <div>
            <span>Last active</span>
            <strong>{formatRelative(group.lastActiveAt)}</strong>
          </div>
          <div>
            <span>Device</span>
            <strong>{group.devices.join(", ") || "Unknown"}</strong>
          </div>
        </div>

        <div className="admin-presence-session-list" aria-label={`${group.name || "Admin"} sessions`}>
          {visibleSessions.map((row) => (
            <div key={row.session_id || row.id} className={`admin-presence-session is-${row.computed_status}`}>
              <span className="admin-presence-session-page">{row.friendly_page}</span>
              <span>{row.device_label}</span>
              <span>{formatRelative(row.last_active_at)}</span>
              <span>{formatDuration(row.logged_in_at)}</span>
            </div>
          ))}
          {compact && group.sessions.length > visibleSessions.length && (
            <div className="admin-presence-session-more">+{group.sessions.length - visibleSessions.length} more sessions</div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="admin-presence-page">
      <header className="admin-presence-hero">
        <div className="admin-presence-hero-copy">
          <p className="admin-presence-eyebrow">OneLuxStay Executive</p>
          <h1>Live Admin Monitor</h1>
          <div className="admin-presence-meta">
            <span>Last sync: {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Waiting..."}</span>
            <span>{hasRealtime ? "Realtime connected" : "Realtime unavailable"}</span>
            <span>{activeAdminCount} active admins</span>
            <span>{rows.length} recent sessions tracked</span>
          </div>
        </div>
        <div className="admin-presence-hero-actions">
          <button
            type="button"
            onClick={() =>
              refreshNow().catch((error) => logPresencePageError("manual presence refresh failed", error))
            }
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <Link to="/executive-ols">Back to Dashboard</Link>
        </div>
      </header>

      <section className="admin-presence-stats" aria-label="Presence summary">
        <article>
          <span>Online Admins</span>
          <strong>{onlineGroups.length}</strong>
        </article>
        <article>
          <span>Away Admins</span>
          <strong>{awayGroups.length}</strong>
        </article>
        <article>
          <span>Recent Offline</span>
          <strong>{offlineGroups.length}</strong>
        </article>
        <article>
          <span>Active Sessions</span>
          <strong>{activeSessionCount}</strong>
        </article>
      </section>

      {error && <div className="admin-presence-error">{error}</div>}

      <section className="admin-presence-monitor" aria-label="Live admin monitor">
        <div className="admin-presence-live-column">
          <section className="admin-presence-section">
            <div className="admin-presence-section-head">
              <div>
                <span>Online</span>
                <h2>Who is working now</h2>
              </div>
              <strong>{onlineGroups.length}</strong>
            </div>
            <div className="admin-presence-stack">
              {onlineGroups.map((group) => renderAdminGroup(group))}
              {!onlineGroups.length && !loading && (
                <div className="admin-presence-empty">No admins are online right now.</div>
              )}
            </div>
          </section>

          <section className="admin-presence-section">
            <div className="admin-presence-section-head">
              <div>
                <span>Away</span>
                <h2>Recently active</h2>
              </div>
              <strong>{awayGroups.length}</strong>
            </div>
            <div className="admin-presence-stack">
              {awayGroups.map((group) => renderAdminGroup(group))}
              {!awayGroups.length && !loading && (
                <div className="admin-presence-empty">No recently idle admins.</div>
              )}
            </div>
          </section>
        </div>

        <aside className="admin-presence-offline-panel" aria-label="Recently offline admins">
          <div className="admin-presence-section-head">
            <div>
              <span>Offline</span>
              <h2>Recent only</h2>
            </div>
            <strong>{offlineGroups.length}</strong>
          </div>
          <div className="admin-presence-stack">
            {offlineGroups.map((group) => renderAdminGroup(group, { compact: true }))}
            {!offlineGroups.length && !loading && (
              <div className="admin-presence-empty">No recent offline sessions.</div>
            )}
          </div>
        </aside>
      </section>

      {!adminGroups.length && !loading && (
        <section className="admin-presence-empty admin-presence-empty--wide">
          <h3>No admin sessions yet.</h3>
          <p>Active admins will appear here automatically after their first heartbeat.</p>
        </section>
      )}
    </div>
  );
}

export default AdminPresencePage;
