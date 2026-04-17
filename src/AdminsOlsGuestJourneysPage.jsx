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

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const titleCase = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatPageLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Unknown page";
  if (normalized === "home") return "Homepage";
  if (normalized === "listing") return "Listing Page";
  if (normalized === "global") return "Global Listings";
  if (normalized === "policy") return "Policy Page";
  return titleCase(normalized);
};

const formatGuestJourneyEventLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "page_view") return "Page View";
  if (normalized === "listing_click") return "Listing Click";
  if (normalized === "city_click") return "City Click";
  if (normalized === "search_submit") return "Search Submit";
  return titleCase(normalized) || "Guest Event";
};

const formatGuestClickSourceLabel = (item = {}) => {
  const sourceSection = String(item?.sourceSection || "").trim();
  const sourceLabel = String(item?.sourceLabel || "").trim();
  const parts = [];
  if (sourceSection) parts.push(titleCase(sourceSection));
  if (sourceLabel) parts.push(titleCase(sourceLabel));
  return parts.join(" / ") || "Guest interaction";
};

const formatGuestSessionShortId = (sessionId = "") => {
  const normalized = String(sessionId || "").trim();
  if (!normalized || normalized === "unknown") return "unknown";
  const cleaned = normalized.startsWith("guest-") ? normalized.slice(6) : normalized;
  const compact = cleaned.replace(/[^a-z0-9]+/gi, "").slice(0, 8);
  return compact || cleaned.slice(0, 8) || normalized.slice(0, 8);
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

const splitDateTimeLocalValue = (value = "") => {
  const normalized = sanitizeDateInput(value);
  if (!normalized) return { date: "", time: "" };
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
  const startParts = splitDateTimeLocalValue(toDateTimeLocalValue(start));
  const endParts = splitDateTimeLocalValue(toDateTimeLocalValue(end));

  return {
    eventType: "",
    city: "",
    pageType: "",
    pathname: "",
    startDate: startParts.date,
    startTime: startParts.time,
    endDate: endParts.date,
    endTime: endParts.time,
  };
};

function AdminsOlsGuestJourneysPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadAdminsOlsSession());
  const [currentAdmin, setCurrentAdmin] = useState(() => session?.user || {});
  const [filters, setFilters] = useState(() => buildDefaultFilters());
  const [events, setEvents] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const guestJourneys = useMemo(() => {
    const grouped = new Map();

    for (const item of Array.isArray(events) ? events : []) {
      const sessionId = String(item?.sessionId || "").trim() || "unknown";
      const existing = grouped.get(sessionId);
      if (existing) {
        existing.steps.push(item);
      } else {
        grouped.set(sessionId, { sessionId, steps: [item] });
      }
    }

    const journeys = Array.from(grouped.values()).map((journey) => {
      const steps = (journey.steps || [])
        .slice()
        .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));

      const first = steps[0] || {};
      const last = steps[steps.length - 1] || {};

      const uniqueCities = Array.from(
        new Set(steps.map((step) => String(step?.city || "").trim()).filter(Boolean)),
      );
      const uniquePages = Array.from(
        new Set(
          steps
            .map((step) => String(step?.pathname || step?.destinationPath || "").trim())
            .filter(Boolean),
        ),
      );

      const preview =
        String(last.listingTitle || "").trim() ||
        String(last.city || "").trim() ||
        String(last.pathname || "").trim() ||
        String(last.destinationPath || "").trim() ||
        "Guest activity";

      const subtitleParts = [];
      if (last.pageType) subtitleParts.push(formatPageLabel(last.pageType));
      if (last.city) subtitleParts.push(last.city);
      const subtitle = subtitleParts.join(" | ") || "Guest journey";

      return {
        sessionId: journey.sessionId,
        title: preview,
        preview,
        subtitle,
        startAt: first.createdAt || "",
        endAt: last.createdAt || "",
        steps,
        stepCount: steps.length,
        uniqueCities,
        uniquePages,
        lastPage: String(last?.pathname || last?.destinationPath || "").trim(),
        lastEventType: String(last?.eventType || "").trim(),
        lastListingId: String(last?.listingId || "").trim(),
        shortId: formatGuestSessionShortId(journey.sessionId),
      };
    });

    journeys.sort((left, right) => {
      const rightTime = new Date(right.endAt || 0).getTime();
      const leftTime = new Date(left.endAt || 0).getTime();
      return rightTime - leftTime || String(left.sessionId).localeCompare(String(right.sessionId));
    });

    return journeys.map((journey) => ({
      ...journey,
      guestLabel: journey.shortId && journey.shortId !== "unknown" ? `Session ${journey.shortId}` : "Session unknown",
    }));
  }, [events]);

  const selectedJourney = useMemo(() => {
    if (!selectedSessionId) return null;
    return guestJourneys.find((journey) => journey.sessionId === selectedSessionId) || null;
  }, [guestJourneys, selectedSessionId]);

  const summary = useMemo(() => {
    const topPages = Object.entries(
      events.reduce((acc, item) => {
        const key = String(item?.pathname || item?.destinationPath || "Unknown path").trim() || "Unknown path";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5);

    const topEvents = Object.entries(
      events.reduce((acc, item) => {
        const key = formatGuestJourneyEventLabel(item?.eventType);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5);

    return { topPages, topEvents };
  }, [events]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Guest Journeys";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const ensureFreshSession = async () => {
      if (!session?.accessToken && !session?.sharedKey) return;
      if (session?.sharedKey || !isAdminsOlsSessionExpired(session)) return;

      const refreshed = await refreshAdminsOlsSession(apiBase, session).catch(() => null);
      if (!active) return;
      if (refreshed?.accessToken || refreshed?.sharedKey) {
        setSession(refreshed);
        setCurrentAdmin(refreshed?.user || {});
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
      if (response.status === 401 || response.status === 403) {
        clearAdminsOlsSession();
        setSession(null);
      }
      throw new Error(data?.error || "Admin request failed.");
    }

    return data;
  };

  const fetchJourneyEvents = async ({ silent = false } = {}) => {
    if (!session?.accessToken && !session?.sharedKey) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const payload = await performAdminRequest({
        method: "POST",
        payload: {
          action: "get_guest_journey_events",
          eventType: filters.eventType,
          city: filters.city,
          pageType: filters.pageType,
          pathname: filters.pathname,
          startAt: toIsoIfPossible(combineDateAndTime(filters.startDate, filters.startTime)),
          endAt: toIsoIfPossible(combineDateAndTime(filters.endDate, filters.endTime)),
          limit: 120,
        },
      });

      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      // If the currently selected journey disappeared because of filters, clear the selection.
      const nextSessionIds = new Set(
        (Array.isArray(payload?.events) ? payload.events : []).map((item) => String(item?.sessionId || "").trim() || "unknown"),
      );
      setSelectedSessionId((current) => (current && !nextSessionIds.has(current) ? "" : current));
      setCurrentAdmin((current) => payload?.currentAdmin || current);
      if (!silent) {
        setNotice("Guest journey log refreshed.");
      }
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to load guest journey log."));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!session?.accessToken && !session?.sharedKey) return;
    fetchJourneyEvents();
  }, [session?.accessToken, session?.sharedKey]);

  const handleFilterChange = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleApplyFilters = async (event) => {
    event.preventDefault();
    const startAt = combineDateAndTime(filters.startDate, filters.startTime);
    const endAt = combineDateAndTime(filters.endDate, filters.endTime);

    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
      setError("Start date must be before the end date.");
      return;
    }

    await fetchJourneyEvents();
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
          action: "get_guest_journey_events",
          eventType: defaults.eventType,
          city: defaults.city,
          pageType: defaults.pageType,
          pathname: defaults.pathname,
          startAt: toIsoIfPossible(combineDateAndTime(defaults.startDate, defaults.startTime)),
          endAt: toIsoIfPossible(combineDateAndTime(defaults.endDate, defaults.endTime)),
          limit: 120,
        },
      });
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      setCurrentAdmin((current) => payload?.currentAdmin || current);
      setNotice("Guest journey filters reset to the last 7 days.");
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to reset guest journey filters."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminsOlsSession();
    setSession(null);
    navigate("/admins-ols/login", { replace: true });
  };

  const handleNavigateToSection = (sectionId = "") => {
    if (typeof document !== "undefined") {
      const section = document.getElementById(sectionId);
      section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
    setIsSidebarOpen(false);
  };

  const handleSelectJourney = (journey = null) => {
    const sessionId = String(journey?.sessionId || "").trim();
    if (!sessionId) return;
    setSelectedSessionId(sessionId);

    // On mobile, move the user to the timeline panel so it feels like a focused drill-down.
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      try {
        const section = document.getElementById("journey-detail");
        section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      } catch {
        // ignore
      }
    }
  };

  if (!session?.accessToken && !session?.sharedKey) {
    return <Navigate to="/admins-ols/login" replace />;
  }

  if (currentAdmin?.isSuperAdmin !== true) {
    return (
      <div className="admins-ols-page">
        <div className="admins-ols-shell">
          <main className="admins-ols-main">
            <header className="admins-ols-hero">
              <div className="admins-ols-hero-content">
                <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
                <h1>Guest Journey Log</h1>
                <p className="admins-ols-hero-copy">
                  Superadmin access required.
                </p>
              </div>
              <div className="admins-ols-toolbar">
                <Link className="admins-ols-profile-action" to="/admins-ols">
                  Back to Dashboard
                </Link>
              </div>
            </header>
            <div className="admins-ols-error">
              This page contains detailed guest journey analytics and is restricted to superadmins.
            </div>
          </main>
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
            aria-controls="admins-ols-journeys-sidebar"
          >
            {isSidebarOpen ? "Close Panel" : "Open Panel"}
          </button>
          <div>
            <strong>Journey Navigation</strong>
            <small>Dashboard return, filters, and guest page tracking</small>
          </div>
        </div>

        <div className={`admins-ols-layout${isSidebarOpen ? " is-sidebar-open" : ""}`}>
          <aside id="admins-ols-journeys-sidebar" className="admins-ols-sidebar" aria-label="Guest journey navigation">
            <div className="admins-ols-side-sticky">
              <section className="admins-ols-side-section">
                <p className="admins-ols-eyebrow">Admin Access</p>
                <h2>{currentAdmin.fullName || currentAdmin.email || "Admin"}</h2>
                <p className="admins-ols-note">
                  Signed in with {session?.sharedKey ? "shared key access" : "Supabase authentication"}.
                </p>
              </section>

              <section className="admins-ols-side-section">
                <div className="admins-ols-card-head">
                  <h3>Quick Jump</h3>
                </div>
                <div className="admins-ols-side-nav">
                  <Link className="admins-ols-side-nav-link" to="/admins-ols">
                    <span>Back to Dashboard</span>
                  </Link>
                  <button type="button" onClick={() => handleNavigateToSection("journey-filters")}>Filters</button>
                  <button type="button" onClick={() => handleNavigateToSection("journey-summary")}>Summary</button>
                  <button type="button" onClick={() => handleNavigateToSection("journey-entries")}>Guest Journeys</button>
                  <span className="admins-ols-side-nav-link is-current" aria-current="page">
                    <span>Guest Journey Log</span>
                    <span className="admins-ols-side-nav-count">{guestJourneys.length}</span>
                  </span>
                </div>
              </section>
            </div>
          </aside>

          <main className="admins-ols-main">
            <header className="admins-ols-hero">
              <div className="admins-ols-hero-content">
                <p className="admins-ols-eyebrow">OneLuxStay Internal</p>
                <h1>Guest Journey Log</h1>
                <p className="admins-ols-hero-copy">
                  Review which pages guests visit, which listings they click, and where interest is building across the site.
                </p>
                <p className="admins-ols-note">
                  Signed in as <strong>{currentAdmin.fullName || currentAdmin.email || "Admin"}</strong>
                  {currentAdmin.email ? ` (${currentAdmin.email})` : ""}
                </p>
              </div>
              <div className="admins-ols-toolbar">
                <button type="button" onClick={() => fetchJourneyEvents()} disabled={loading}>
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
              <article id="journey-filters" className="admins-ols-card">
                <div className="admins-ols-card-head">
                  <h2>Filters</h2>
                </div>
                <form className="admins-ols-form" onSubmit={handleApplyFilters}>
                  <label>
                    Event type
                    <select value={filters.eventType} onChange={handleFilterChange("eventType")}>
                      <option value="">All events</option>
                      <option value="page_view">Page view</option>
                      <option value="listing_click">Listing click</option>
                      <option value="city_click">City click</option>
                      <option value="search_submit">Search submit</option>
                    </select>
                  </label>
                  <label>
                    City
                    <input
                      type="text"
                      value={filters.city}
                      onChange={handleFilterChange("city")}
                      placeholder="Filter by city"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Page type
                    <select value={filters.pageType} onChange={handleFilterChange("pageType")}>
                      <option value="">All page types</option>
                      <option value="home">Homepage</option>
                      <option value="city">City page</option>
                      <option value="listing">Listing page</option>
                      <option value="global">Global listings</option>
                      <option value="policy">Policy page</option>
                    </select>
                  </label>
                  <label>
                    Path contains
                    <input
                      type="text"
                      value={filters.pathname}
                      onChange={handleFilterChange("pathname")}
                      placeholder="Filter by page path"
                      autoComplete="off"
                    />
                  </label>
                  <div className="admins-ols-filter-group">
                    <span className="admins-ols-filter-group-label">Start</span>
                    <div className="admins-ols-filter-row">
                      <label>
                        Date
                        <input type="date" value={filters.startDate} onChange={handleFilterChange("startDate")} />
                      </label>
                      <label>
                        Time
                        <input type="time" value={filters.startTime} onChange={handleFilterChange("startTime")} />
                      </label>
                    </div>
                  </div>
                  <div className="admins-ols-filter-group">
                    <span className="admins-ols-filter-group-label">End</span>
                    <div className="admins-ols-filter-row">
                      <label>
                        Date
                        <input type="date" value={filters.endDate} onChange={handleFilterChange("endDate")} />
                      </label>
                      <label>
                        Time
                        <input type="time" value={filters.endTime} onChange={handleFilterChange("endTime")} />
                      </label>
                    </div>
                  </div>
                  <button type="submit" disabled={loading}>{loading ? "Loading..." : "Apply Filters"}</button>
                  <button type="button" className="is-secondary" disabled={loading} onClick={handleResetFilters}>
                    Reset to Last 7 Days
                  </button>
                </form>
              </article>

              <article id="journey-summary" className="admins-ols-card admins-ols-stat">
                <span>Visible journey events</span>
                <strong>{events.length}</strong>
                <small>Filtered guest page views and click events in the selected date range</small>
                <div className="admins-ols-rollups-grid">
                  <div>
                    <h3>Top pages</h3>
                    <ul>
                      {summary.topPages.map((item) => (
                        <li key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.count}</strong>
                        </li>
                      ))}
                    </ul>
                    {!summary.topPages.length && <p className="admins-ols-empty">No page paths in this range yet.</p>}
                  </div>
                  <div>
                    <h3>Top guest events</h3>
                    <ul>
                      {summary.topEvents.map((item) => (
                        <li key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.count}</strong>
                        </li>
                      ))}
                    </ul>
                    {!summary.topEvents.length && <p className="admins-ols-empty">No guest events in this range yet.</p>}
                  </div>
                </div>
              </article>
            </section>

            <section id="journey-entries" className="admins-ols-card">
              <div className="admins-ols-card-head">
                <h2>Journey Entries by Guests</h2>
                <span className="admins-ols-pill">{guestJourneys.length} guests</span>
              </div>

              <div className="admins-ols-journey-layout">
                <div className="admins-ols-journey-list" aria-label="Guest journeys">
                  {guestJourneys.map((journey) => {
                    const isActive = selectedSessionId && journey.sessionId === selectedSessionId;
                    return (
                      <button
                        key={journey.sessionId}
                        type="button"
                        className={`admins-ols-journey-card${isActive ? " is-active" : ""}`}
                        onClick={() => handleSelectJourney(journey)}
                        aria-pressed={isActive}
                      >
                        <div className="admins-ols-journey-card-top">
                          <div className="admins-ols-log-meta">
                            <span className="admins-ols-badge is-neutral">
                              {formatGuestJourneyEventLabel(journey.lastEventType)}
                            </span>
                            <small>{journey.endAt ? formatDateTime(journey.endAt) : "Unknown"}</small>
                          </div>
                          <span className="admins-ols-pill">{journey.stepCount} steps</span>
                        </div>

                        <p className="admins-ols-journey-title">
                          <strong>{journey.guestLabel || "Session"}</strong>
                        </p>
                        <p className="admins-ols-journey-subtitle">{journey.preview || journey.title}</p>
                        <p className="admins-ols-journey-subtitle">{journey.subtitle}</p>

                        <div className="admins-ols-journey-meta">
                          <small title={journey.sessionId ? `Session ${journey.sessionId}` : undefined}>
                            Session <strong>{journey.shortId || journey.sessionId || "unknown"}</strong>
                          </small>
                          <small>
                            {journey.startAt ? `Start: ${formatDateTime(journey.startAt)}` : "Start: --"}{" "}
                            {journey.endAt ? `| Last: ${formatDateTime(journey.endAt)}` : ""}
                          </small>
                          <small>
                            Cities: {journey.uniqueCities.length ? journey.uniqueCities.join(", ") : "Unknown"} | Pages:{" "}
                            {journey.uniquePages.length || 0}
                          </small>
                        </div>
                      </button>
                    );
                  })}

                  {!guestJourneys.length && (
                    <p className="admins-ols-empty">No guest journey events found for these filters yet.</p>
                  )}
                </div>

                <div id="journey-detail" className="admins-ols-journey-detail" aria-label="Selected guest journey">
                  <div className="admins-ols-card-head">
                    <h3>Journey Steps</h3>
                    <span className="admins-ols-pill">{selectedJourney ? `${selectedJourney.stepCount} steps` : "No selection"}</span>
                  </div>

                  {!selectedJourney ? (
                    <p className="admins-ols-empty">
                      Select a guest card to see their journey step by step.
                    </p>
                  ) : (
                    <div className="admins-ols-stack">
                      <article className="admins-ols-log admins-ols-journey-summary-log">
                        <div className="admins-ols-log-meta">
                          <span className="admins-ols-badge is-neutral">Session</span>
                          <small>{selectedJourney.endAt ? formatDateTime(selectedJourney.endAt) : "Unknown"}</small>
                        </div>
                        <p>
                          <strong>{selectedJourney.guestLabel || "Session"}</strong>
                        </p>
                        <p>{selectedJourney.preview || selectedJourney.title}</p>
                        <p>{selectedJourney.subtitle}</p>
                        <small title={selectedJourney.sessionId ? `Session ${selectedJourney.sessionId}` : undefined}>
                          Session {selectedJourney.shortId || selectedJourney.sessionId || "unknown"}
                        </small>
                        <small>
                          {selectedJourney.startAt ? `Start: ${formatDateTime(selectedJourney.startAt)}` : "Start: --"}{" "}
                          {selectedJourney.endAt ? `| Last: ${formatDateTime(selectedJourney.endAt)}` : ""}
                        </small>
                        {selectedJourney.lastListingId ? <small>Last listing {selectedJourney.lastListingId}</small> : null}
                      </article>

                      {selectedJourney.steps.map((item) => (
                        <article
                          key={item.id || `${selectedJourney.sessionId}-${item.eventType}-${item.createdAt}`}
                          className="admins-ols-log admins-ols-journey-step"
                        >
                          <div className="admins-ols-log-meta">
                            <span className="admins-ols-badge is-neutral">
                              {formatGuestJourneyEventLabel(item.eventType)}
                            </span>
                            <small>{formatDateTime(item.createdAt)}</small>
                          </div>
                          <p>
                            <strong>{item.listingTitle || item.city || item.pathname || item.destinationPath || "Guest activity"}</strong>
                          </p>
                          <p>{formatGuestClickSourceLabel(item)}</p>
                          <small>
                            {formatPageLabel(item.pageType)} | {item.city || "Unknown city"}
                          </small>
                          <small>
                            Source: {item.pathname || "--"} | Destination: {item.destinationPath || "--"}
                          </small>
                          {item.listingId ? <small>Listing {item.listingId}</small> : null}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminsOlsGuestJourneysPage;
