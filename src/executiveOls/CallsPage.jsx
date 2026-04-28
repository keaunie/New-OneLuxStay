import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import apiBase from "../utils/apiBase";
import {
  clearExecutiveOlsSession,
  getExecutiveOlsAuthHeaders,
  loadExecutiveOlsSession,
} from "./utils/executiveOlsAuth";
import "./ExecutiveOls.css";

const REFRESH_MS = 30_000;

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const formatDuration = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}m${s > 0 ? ` ${s}s` : ""}`;
};

const formatPhone = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  const digits = raw.replace(/^\+/, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
};

const getCountryLabel = (country = "") => {
  const c = String(country || "").trim().toLowerCase();
  if (c === "be") return "Belgium";
  return "US";
};

const getStatusLabel = (status = "") => {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "in-progress") return "In Progress";
  if (s === "no-answer") return "Missed";
  if (s === "busy") return "Busy";
  if (s === "failed") return "Failed";
  if (s === "canceled" || s === "cancelled") return "Canceled";
  if (s === "initiated" || s === "ringing") return "Ringing";
  return "Unknown";
};

const getStatusModifier = (status = "") => {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "completed";
  if (s === "in-progress") return "active";
  if (s === "no-answer" || s === "busy" || s === "failed") return "missed";
  if (s === "initiated" || s === "ringing") return "ringing";
  return "unknown";
};

function CallsPage() {
  const [session, setSession] = useState(() => loadExecutiveOlsSession());
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const mountedRef = useRef(true);
  const intervalRef = useRef(null);

  const fetchCalls = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (filterCountry) params.set("country", filterCountry);
        if (filterStatus) params.set("status", filterStatus);

        const res = await fetch(`${apiBase}/admins-ols-calls?${params}`, {
          headers: getExecutiveOlsAuthHeaders(session),
        });

        if (!mountedRef.current) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || `Failed to load calls (${res.status})`);
          return;
        }

        const data = await res.json();
        setCalls(Array.isArray(data?.calls) ? data.calls : []);
      } catch (err) {
        if (mountedRef.current) setError(err?.message || "Unable to load call logs.");
      } finally {
        if (mountedRef.current && !silent) setLoading(false);
      }
    },
    [filterCountry, filterStatus, session],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Call Center — OneLuxStay";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    meta.dataset.callsPage = "true";
    document.head.appendChild(meta);
    return () => {
      document.title = prev;
      meta.remove();
    };
  }, []);

  useEffect(() => {
    fetchCalls();
    intervalRef.current = setInterval(() => fetchCalls({ silent: true }), REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchCalls]);

  if (!session) return <Navigate to="/executive-ols/login" replace />;

  return (
    <div className="executive-ols-page">
      <div className="executive-ols-shell is-whatsapp">
        <div className="executive-ols-layout is-whatsapp">
          <main className="executive-ols-main is-whatsapp">
            <nav className="executive-ols-nav">
              <Link to="/executive-ols" className="executive-ols-nav-item">Executive</Link>
              <Link to="/executive-ols/whatsapp" className="executive-ols-nav-item">WhatsApp</Link>
              <span className="executive-ols-nav-item is-active">Calls</span>
              <Link to="/executive-ols/guest-journeys" className="executive-ols-nav-item">Guest Journeys</Link>
              <Link to="/executive-ols/audit" className="executive-ols-nav-item">Audit</Link>
              <button
                type="button"
                className="executive-ols-nav-item"
                style={{ border: "none", cursor: "pointer" }}
                onClick={() => {
                  clearExecutiveOlsSession();
                  setSession(null);
                }}
              >
                Sign Out
              </button>
            </nav>

            <div className="executive-ols-topbar is-whatsapp">
              <div>
                <p className="executive-ols-eyebrow">OneLuxStay</p>
                <h2 style={{ margin: 0, fontSize: "1.5rem", color: "#281f18" }}>Call Center</h2>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#7b6a5b" }}>
                  Inbound calls — US &amp; Belgium. Auto-refreshes every 30 seconds.
                </p>
              </div>
              <div className="executive-ols-calls-filters">
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="executive-ols-calls-select"
                  aria-label="Filter by country"
                >
                  <option value="">All countries</option>
                  <option value="us">US only</option>
                  <option value="be">Belgium only</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="executive-ols-calls-select"
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="no-answer">Missed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="busy">Busy</option>
                  <option value="failed">Failed</option>
                </select>
                <button
                  type="button"
                  className="executive-ols-ghost-btn"
                  onClick={() => fetchCalls()}
                  disabled={loading}
                  style={{ minHeight: 40 }}
                >
                  {loading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {error && <div className="executive-ols-alert is-error">{error}</div>}

            <section className="executive-ols-calls-list">
              {loading && !calls.length && (
                <p className="executive-ols-empty">Loading call logs…</p>
              )}
              {!loading && !calls.length && !error && (
                <p className="executive-ols-empty">
                  No calls yet. Inbound calls appear here as they arrive on your US and Belgium numbers.
                </p>
              )}
              {calls.map((call) => {
                const mod = getStatusModifier(call.status);
                const country = getCountryLabel(call.country);
                const duration = call.duration != null ? formatDuration(call.duration) : "";
                return (
                  <article key={call.id || call.call_sid} className="executive-ols-call-row">
                    <div className="executive-ols-call-avatar-wrap">
                      <div className="executive-ols-call-avatar">
                        {country === "Belgium" ? "BE" : "US"}
                      </div>
                    </div>
                    <div className="executive-ols-call-body">
                      <strong className="executive-ols-call-number">{formatPhone(call.from_number)}</strong>
                      <div className="executive-ols-call-meta">
                        <span className="executive-ols-call-country-tag">{country}</span>
                        {duration && <span className="executive-ols-call-duration">{duration}</span>}
                        <time className="executive-ols-call-time" dateTime={call.created_at}>
                          {formatDateTime(call.created_at)}
                        </time>
                      </div>
                    </div>
                    <div className="executive-ols-call-status-wrap">
                      <span className={`executive-ols-call-status is-${mod}`}>
                        {getStatusLabel(call.status)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default CallsPage;
