import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
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
      if (!loaded?.accessToken && !loaded?.sharedKey) {
        if (active) {
          setSession(null);
          setAuthChecking(false);
        }
        return;
      }

      if (loaded?.accessToken && isAdminsOlsSessionExpired(loaded)) {
        const refreshed = await refreshAdminsOlsSession(apiBase, loaded).catch(() => null);
        if (active) {
          setSession(refreshed || null);
          setAuthChecking(false);
        }
        return;
      }

      if (active) {
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
    onlineCount,
    awayCount,
    offlineCount,
    lastSyncedAt,
    refreshNow,
    hasRealtime,
  } = useAdminPresence({
    session,
    enabled: !authChecking,
    currentPath,
  });

  const isSuperAdmin = userHasSuperAdminRole(session?.user || {});

  if (!authChecking && !session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/executive-ols/login?next=%2Fexecutive-ols%2Fadmin-presence" replace />;
  }

  if (!authChecking && !isSuperAdmin) {
    return <Navigate to="/executive-ols" replace />;
  }

  return (
    <div className="admin-presence-page">
      <header className="admin-presence-hero">
        <div className="admin-presence-hero-copy">
          <p className="admin-presence-eyebrow">OneLuxStay Executive</p>
          <p className="admin-presence-superadmin-badge">Superadmin Control Center</p>
          <h1>Live Admin Presence</h1>
          <p>Monitor active admins, route context, and real-time availability across the admin system.</p>
          <div className="admin-presence-meta">
            <span>Last sync: {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Waiting..."}</span>
            <span>{hasRealtime ? "Realtime connected" : "Realtime unavailable"}</span>
          </div>
        </div>
        <div className="admin-presence-hero-actions">
          <button type="button" onClick={() => refreshNow().catch(() => null)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <Link to="/executive-ols">Back to Dashboard</Link>
        </div>
      </header>

      <section className="admin-presence-stats" aria-label="Presence summary">
        <article>
          <span>Online</span>
          <strong>{onlineCount}</strong>
        </article>
        <article>
          <span>Away</span>
          <strong>{awayCount}</strong>
        </article>
        <article>
          <span>Offline</span>
          <strong>{offlineCount}</strong>
        </article>
        <article>
          <span>Total Sessions</span>
          <strong>{rows.length}</strong>
        </article>
      </section>

      {error && <div className="admin-presence-error">{error}</div>}

      <section className="admin-presence-grid" aria-label="Admin presence cards">
        {rows.map((row) => {
          const status = String(row?.computed_status || row?.status || "offline").toLowerCase();
          return (
            <article key={row.session_id || row.id} className="admin-presence-card">
              <div className="admin-presence-card-head">
                <div className="admin-presence-avatar">{getInitials(row)}</div>
                <div className="admin-presence-identity">
                  <h2>{row.full_name || "Admin"}</h2>
                  <p>{row.email || "No email"}</p>
                </div>
                <span className={`admin-presence-status is-${status}`}>{getStatusLabel(status)}</span>
              </div>
              <dl className="admin-presence-details">
                <div>
                  <dt>Role</dt>
                  <dd>{row.role || "admin"}</dd>
                </div>
                <div>
                  <dt>Device</dt>
                  <dd>{row.device_type || "desktop"}</dd>
                </div>
                <div>
                  <dt>Path</dt>
                  <dd>{row.current_path || "/"}</dd>
                </div>
                <div>
                  <dt>Last Active</dt>
                  <dd>{formatRelative(row.last_active_at)}</dd>
                </div>
                <div>
                  <dt>Session Started</dt>
                  <dd>{formatDateTime(row.logged_in_at)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(row.logged_in_at)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
        {!rows.length && !loading && (
          <article className="admin-presence-empty">
            <h3>No active admin sessions yet.</h3>
            <p>Once admins log in, their live presence will appear here automatically.</p>
          </article>
        )}
      </section>
    </div>
  );
}

export default AdminPresencePage;
