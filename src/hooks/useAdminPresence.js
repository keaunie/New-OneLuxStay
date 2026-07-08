import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSupabasePresenceClient,
  getSupabasePresenceRestConfig,
  hasSupabasePresenceConfig,
} from "../utils/supabasePresenceClient";
import { getNormalizedUserRole } from "../../shared/adminRoles.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const ACTIVITY_PUSH_DEBOUNCE_MS = 3_500;
const ONLINE_WINDOW_MS = 60_000;
const AWAY_WINDOW_MS = 300_000;
const EXPLICIT_ONLINE_WINDOW_MS = AWAY_WINDOW_MS;
const RECENT_OFFLINE_WINDOW_MS = 6 * 60 * 60_000;
const STALE_CLEANUP_WINDOW_MS = 24 * 60 * 60_000;
const PRESENCE_SESSION_STORAGE_PREFIX = "ols-admin-presence-session";
const LOG_PREFIX = "[Admin Presence]";
const ENV_DEBUG_PRESENCE =
  String(import.meta.env.VITE_ADMIN_PRESENCE_DEBUG || "")
    .trim()
    .toLowerCase() === "true";
const PRESENCE_DEBUG_STORAGE_KEY = "ols-admin-presence-debug";
const MAX_DIAGNOSTIC_EVENTS = 80;
const REDACTED_HEADER_NAMES = new Set(["authorization", "apikey"]);

const isPresenceDebugEnabled = () => {
  if (ENV_DEBUG_PRESENCE) return true;
  if (typeof window === "undefined") return false;
  try {
    return (
      String(window.localStorage?.getItem(PRESENCE_DEBUG_STORAGE_KEY) || "")
        .trim()
        .toLowerCase() === "true" ||
      String(window.sessionStorage?.getItem(PRESENCE_DEBUG_STORAGE_KEY) || "")
        .trim()
        .toLowerCase() === "true"
    );
  } catch {
    return false;
  }
};

const sanitizeString = (value = "", maxLength = 300) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const getPresenceRuntime = () => {
  if (typeof window === "undefined") return null;
  window.__OLS_ADMIN_PRESENCE_DIAGNOSTICS__ ||= {
    nextHookInstanceNumber: 1,
    nextClientInstanceNumber: 1,
    activeHooks: {},
    activeIntervals: {},
    clientsCreated: [],
    events: [],
    lastSuccessfulHeartbeat: null,
    firstFailedHeartbeat: null,
  };
  return window.__OLS_ADMIN_PRESENCE_DIAGNOSTICS__;
};

const getNextHookInstanceId = () => {
  const runtime = getPresenceRuntime();
  if (!runtime) return "server";
  const id = `presence-hook-${runtime.nextHookInstanceNumber || 1}`;
  runtime.nextHookInstanceNumber = (runtime.nextHookInstanceNumber || 1) + 1;
  return id;
};

const getNextClientInstanceId = () => {
  const runtime = getPresenceRuntime();
  if (!runtime) return "presence-client-server";
  const id = `presence-client-${runtime.nextClientInstanceNumber || 1}`;
  runtime.nextClientInstanceNumber = (runtime.nextClientInstanceNumber || 1) + 1;
  return id;
};

const storeDiagnosticEvent = (event = {}) => {
  if (!isPresenceDebugEnabled()) return;
  const runtime = getPresenceRuntime();
  if (!runtime) return;
  runtime.events = [event, ...(runtime.events || [])].slice(0, MAX_DIAGNOSTIC_EVENTS);
};

const registerActiveHook = (hookInstanceId = "", detail = {}) => {
  if (!isPresenceDebugEnabled()) return;
  const runtime = getPresenceRuntime();
  if (!runtime || !hookInstanceId) return;
  runtime.activeHooks[hookInstanceId] = {
    ...detail,
    updatedAt: new Date().toISOString(),
  };
};

const unregisterActiveHook = (hookInstanceId = "") => {
  const runtime = getPresenceRuntime();
  if (!runtime || !hookInstanceId) return;
  delete runtime.activeHooks[hookInstanceId];
};

const registerActiveInterval = (intervalRuntimeId = "", detail = {}) => {
  if (!isPresenceDebugEnabled()) return;
  const runtime = getPresenceRuntime();
  if (!runtime || !intervalRuntimeId) return;
  runtime.activeIntervals[intervalRuntimeId] = {
    ...detail,
    startedAt: new Date().toISOString(),
  };
};

const unregisterActiveInterval = (intervalRuntimeId = "") => {
  const runtime = getPresenceRuntime();
  if (!runtime || !intervalRuntimeId) return;
  delete runtime.activeIntervals[intervalRuntimeId];
};

const recordClientCreated = (detail = {}) => {
  if (!isPresenceDebugEnabled()) return;
  const runtime = getPresenceRuntime();
  if (!runtime) return;
  runtime.clientsCreated = [
    {
      ...detail,
      createdAt: new Date().toISOString(),
    },
    ...(runtime.clientsCreated || []),
  ].slice(0, MAX_DIAGNOSTIC_EVENTS);
};

const getActiveRuntimeCounts = () => {
  const runtime = getPresenceRuntime();
  if (!runtime) return { activeHookCount: 0, activeIntervalCount: 0, clientCount: 0 };
  return {
    activeHookCount: Object.keys(runtime.activeHooks || {}).length,
    activeIntervalCount: Object.keys(runtime.activeIntervals || {}).length,
    clientCount: Array.isArray(runtime.clientsCreated) ? runtime.clientsCreated.length : 0,
  };
};

const recordHeartbeatDiagnostic = (diagnostic = {}, result = {}) => {
  if (!isPresenceDebugEnabled()) return null;
  const runtime = getPresenceRuntime();
  if (!runtime) return null;

  const entry = {
    ...diagnostic,
    ...result,
    recordedAt: new Date().toISOString(),
    runtimeCounts: getActiveRuntimeCounts(),
  };

  if (result.ok) {
    runtime.lastSuccessfulHeartbeat = entry;
  } else if (!runtime.firstFailedHeartbeat) {
    runtime.firstFailedHeartbeat = entry;
    logPresence("first failed heartbeat comparison", {
      lastSuccessfulHeartbeat: runtime.lastSuccessfulHeartbeat,
      firstFailedHeartbeat: entry,
    });
  }

  storeDiagnosticEvent({
    type: result.ok ? "heartbeat-success" : "heartbeat-failure",
    ...entry,
  });

  return entry;
};

const decodeJwtPayload = (token = "") => {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch (error) {
    console.error(`${LOG_PREFIX} JWT decode failed`, error);
    return null;
  }
};

const getTokenDiagnostics = (accessToken = "") => {
  const token = String(accessToken || "");
  const claims = decodeJwtPayload(token);
  return {
    accessTokenPresent: Boolean(token),
    accessTokenLength: token.length,
    authUid: claims?.sub || "",
    jwtRole: claims?.role || "",
    jwtExpiresAt: claims?.exp ? new Date(Number(claims.exp) * 1000).toISOString() : "",
    jwtIssuedAt: claims?.iat ? new Date(Number(claims.iat) * 1000).toISOString() : "",
    appMetadata: claims?.app_metadata || null,
    userMetadata: claims?.user_metadata || null,
    adminRole:
      claims?.app_metadata?.admin_role ||
      claims?.app_metadata?.role ||
      claims?.user_metadata?.admin_role ||
      claims?.user_metadata?.role ||
      "",
  };
};

const getSessionDiagnostics = ({ adminId = "", email = "", accessToken = "", role = "" } = {}) => ({
  sessionExists: Boolean(adminId || email || accessToken),
  userId: adminId,
  email,
  role,
  ...getTokenDiagnostics(accessToken),
});

const getAccessTokenHashPrefix = async (accessToken = "") => {
  const token = String(accessToken || "");
  if (!token) return "";

  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
      const encoded = new TextEncoder().encode(token);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 20);
    }
  } catch {
    // Fall through to a non-cryptographic fingerprint. It is only a diagnostic token change marker.
  }

  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0").repeat(3).slice(0, 20);
};

const getHeartbeatRequestUrl = (supabaseUrl = "") => {
  const baseUrl = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/rest/v1/admin_presence?on_conflict=session_id&select=*`;
};

const summarizeHeaders = (...headerSources) => {
  const out = {};
  const assignHeader = (key = "", value = "") => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const lowerKey = normalizedKey.toLowerCase();
    out[normalizedKey] = REDACTED_HEADER_NAMES.has(lowerKey) ? "[redacted]" : String(value || "");
  };

  headerSources.filter(Boolean).forEach((headers) => {
    if (headers instanceof Headers) {
      headers.forEach((value, key) => assignHeader(key, value));
      return;
    }
    if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => assignHeader(key, value));
      return;
    }
    if (typeof headers === "object") {
      Object.entries(headers).forEach(([key, value]) => assignHeader(key, value));
    }
  });

  return out;
};

const getResponseHeaders = (headers) => {
  const out = {};
  try {
    headers?.forEach((value, key) => {
      out[key] = value;
    });
  } catch {
    return out;
  }
  return out;
};

const getRequestUrl = (input) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || "");
};

const getRequestMethod = (input, init = {}) =>
  String(init?.method || input?.method || "GET").toUpperCase();

const logPresence = (stage = "", detail = {}) => {
  if (!isPresenceDebugEnabled()) return;
  console.log(`${LOG_PREFIX} ${stage}`, detail);
};

const logPresenceError = (stage = "", error = null, detail = {}) => {
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

const getDeviceType = () => {
  if (typeof window === "undefined") return "desktop";
  const width = Number(window.innerWidth || 0);
  if (width <= 768) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
};

const generateSessionId = (adminId = "") => {
  const prefix = sanitizeString(adminId, 80) || "admin";
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return sanitizeString(`${prefix}:${randomPart}`, 140);
};

const canUseSessionStorage = () => {
  try {
    return typeof window !== "undefined" && Boolean(window.sessionStorage);
  } catch {
    return false;
  }
};

const getPresenceSessionStorageKey = (adminId = "") =>
  `${PRESENCE_SESSION_STORAGE_PREFIX}:${sanitizeString(adminId, 120) || "anonymous"}`;

const readStoredPresenceSession = (adminId = "") => {
  if (!adminId || !canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(getPresenceSessionStorageKey(adminId));
    const parsed = raw ? JSON.parse(raw) : null;
    const sessionId = sanitizeString(parsed?.sessionId, 140);
    const loggedInAt = sanitizeString(parsed?.loggedInAt, 80);
    if (!sessionId || !loggedInAt) return null;
    return { sessionId, loggedInAt };
  } catch {
    return null;
  }
};

const writeStoredPresenceSession = (adminId = "", value = {}) => {
  if (!adminId || !canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(getPresenceSessionStorageKey(adminId), JSON.stringify(value));
  } catch {
    // Ignore browser storage failures; heartbeat still works with an in-memory session id.
  }
};

const getOrCreatePresenceSession = (adminId = "") => {
  const normalizedAdminId = sanitizeString(adminId, 120);
  if (!normalizedAdminId) return { sessionId: "", loggedInAt: "" };

  const stored = readStoredPresenceSession(normalizedAdminId);
  if (stored) return stored;

  const next = {
    sessionId: generateSessionId(normalizedAdminId),
    loggedInAt: new Date().toISOString(),
  };
  writeStoredPresenceSession(normalizedAdminId, next);
  return next;
};

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPresenceAgeMs = (row = {}) => {
  const timestamp = toTimestamp(row?.last_active_at);
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - timestamp);
};

const getStatusFromRow = (row = {}) => {
  const explicitStatus = sanitizeString(row?.status, 20).toLowerCase();
  if (explicitStatus === "offline") return "offline";
  const ageMs = getPresenceAgeMs(row);
  if (explicitStatus === "online" && ageMs <= EXPLICIT_ONLINE_WINDOW_MS) return "online";
  if (ageMs <= ONLINE_WINDOW_MS) return "online";
  if (ageMs <= AWAY_WINDOW_MS) return "away";
  return "offline";
};

const isRecentPresenceRow = (row = {}) =>
  getStatusFromRow(row) !== "offline" || getPresenceAgeMs(row) <= RECENT_OFFLINE_WINDOW_MS;

const mergePresenceRow = (rows = [], nextRow = {}) => {
  const sessionId = sanitizeString(nextRow?.session_id, 140);
  if (!sessionId) return rows;

  const filtered = rows.filter((row) => sanitizeString(row?.session_id, 140) !== sessionId);
  return [nextRow, ...filtered].sort((left, right) => {
    const leftTime = toTimestamp(left?.last_active_at);
    const rightTime = toTimestamp(right?.last_active_at);
    return rightTime - leftTime;
  });
};

const deletePresenceRow = (rows = [], deletedRow = {}) => {
  const sessionId = sanitizeString(deletedRow?.session_id, 140);
  if (!sessionId) return rows;
  return rows.filter((row) => sanitizeString(row?.session_id, 140) !== sessionId);
};

export const useAdminPresence = ({ session = null, enabled = true, currentPath = "" } = {}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const clientRef = useRef(null);
  const channelRef = useRef(null);
  const loggedInAtRef = useRef(new Date().toISOString());
  const lastInteractionAtRef = useRef(0);
  const activityPushTimeoutRef = useRef(null);
  const hookInstanceIdRef = useRef(null);
  const clientInstanceIdRef = useRef("");
  const heartbeatCounterRef = useRef(0);
  const networkContextRef = useRef(null);
  const accessTokenHashRef = useRef("");

  if (hookInstanceIdRef.current === null) {
    hookInstanceIdRef.current = getNextHookInstanceId();
  }

  const adminId = sanitizeString(session?.user?.id, 120);
  const email = sanitizeString(session?.user?.email, 200).toLowerCase();
  const accessToken = sanitizeString(session?.accessToken, 4000);
  const fullName = sanitizeString(session?.user?.fullName, 160);
  const role = sanitizeString(getNormalizedUserRole(session?.user || {}), 80) || "admin";
  const normalizedPath = sanitizeString(currentPath || "/", 240) || "/";
  const presenceSession = useMemo(() => getOrCreatePresenceSession(adminId), [adminId]);
  const sessionId = presenceSession.sessionId;
  const persistedLoggedInAt = presenceSession.loggedInAt;

  const canRun = enabled && Boolean(adminId && email && accessToken && hasSupabasePresenceConfig);

  useEffect(() => {
    let active = true;
    if (!isPresenceDebugEnabled() || !accessToken) {
      accessTokenHashRef.current = "";
      return () => {
        active = false;
      };
    }

    getAccessTokenHashPrefix(accessToken).then((hash) => {
      if (!active) return;
      accessTokenHashRef.current = hash;
      logPresence("access token hash updated", {
        hookInstanceId: hookInstanceIdRef.current,
        userId: adminId,
        email,
        accessTokenHashPrefix: hash,
        sessionExpiresAt: sanitizeString(session?.expiresAt, 80),
        jwtExpiresAt: getTokenDiagnostics(accessToken).jwtExpiresAt,
      });
    });

    return () => {
      active = false;
    };
  }, [accessToken, adminId, email, session?.expiresAt]);

  const buildHeartbeatDiagnostics = useCallback(
    async ({ heartbeatNumber = 0, heartbeatKind = "unknown", status = "", payload = null } = {}) => {
      const restConfig = getSupabasePresenceRestConfig();
      const tokenDiagnostics = getTokenDiagnostics(accessToken);
      const accessTokenHashPrefix = isPresenceDebugEnabled()
        ? accessTokenHashRef.current || (await getAccessTokenHashPrefix(accessToken))
        : "";

      return {
        hookInstanceId: hookInstanceIdRef.current,
        clientInstanceId: clientInstanceIdRef.current,
        heartbeatNumber,
        heartbeatKind,
        timestamp: new Date().toISOString(),
        userId: adminId,
        email,
        role,
        status,
        currentPath: normalizedPath,
        sessionId,
        sessionExpiresAt: sanitizeString(session?.expiresAt, 80),
        jwtExpiresAt: tokenDiagnostics.jwtExpiresAt,
        jwtIssuedAt: tokenDiagnostics.jwtIssuedAt,
        jwtRole: tokenDiagnostics.jwtRole,
        accessTokenHashPrefix,
        supabaseUrl: restConfig.supabaseUrl,
        requestUrl: getHeartbeatRequestUrl(restConfig.supabaseUrl),
        payload,
        runtimeCounts: getActiveRuntimeCounts(),
      };
    },
    [accessToken, adminId, email, normalizedPath, role, session?.expiresAt, sessionId],
  );

  const instrumentedFetch = useCallback(async (input, init = {}) => {
    const context = networkContextRef.current || {};
    const requestStartedAt = new Date().toISOString();
    const requestUrl = getRequestUrl(input);
    const method = getRequestMethod(input, init);
    const requestHeaders = summarizeHeaders(input?.headers, init?.headers);

    logPresence("network request", {
      ...context,
      requestStartedAt,
      method,
      requestUrl,
      requestHeaders,
      runtimeCounts: getActiveRuntimeCounts(),
    });

    try {
      const response = await fetch(input, init);
      const responseHeaders = getResponseHeaders(response.headers);
      let responseBody = "";

      if (!response.ok || response.status >= 500) {
        try {
          responseBody = await response.clone().text();
        } catch {
          responseBody = "[unavailable]";
        }
      }

      logPresence("network response", {
        ...context,
        requestStartedAt,
        responseReceivedAt: new Date().toISOString(),
        method,
        requestUrl,
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        responseHeaders,
        responseBody: sanitizeString(responseBody, 2000),
        runtimeCounts: getActiveRuntimeCounts(),
      });

      return response;
    } catch (error) {
      logPresenceError("network request failed", error, {
        ...context,
        requestStartedAt,
        failedAt: new Date().toISOString(),
        method,
        requestUrl,
        requestHeaders,
        runtimeCounts: getActiveRuntimeCounts(),
      });
      throw error;
    }
  }, []);

  useEffect(() => {
    logPresence("hook state", {
      hookInstanceId: hookInstanceIdRef.current,
      enabled,
      canRun,
      hasSupabasePresenceConfig,
      hasClient: Boolean(clientRef.current),
      currentPath: normalizedPath,
      missing: {
        adminId: !adminId,
        email: !email,
        accessToken: !accessToken,
        supabaseConfig: !hasSupabasePresenceConfig,
      },
      session: getSessionDiagnostics({ adminId, email, accessToken, role }),
    });
  }, [accessToken, adminId, canRun, email, enabled, normalizedPath, role]);

  const upsertPresence = useCallback(
    async ({ statusOverride = "", heartbeatKind = "manual" } = {}) => {
      const heartbeatNumber = heartbeatCounterRef.current + 1;
      heartbeatCounterRef.current = heartbeatNumber;

      if (!canRun || !clientRef.current || !sessionId) {
        const skippedDiagnostics = await buildHeartbeatDiagnostics({
          heartbeatNumber,
          heartbeatKind,
          status: sanitizeString(statusOverride, 20).toLowerCase(),
        });
        logPresence("heartbeat skipped", {
          ...skippedDiagnostics,
          canRun,
          hasClient: Boolean(clientRef.current),
          sessionIdPresent: Boolean(sessionId),
          session: getSessionDiagnostics({ adminId, email, accessToken, role }),
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const explicitStatus = sanitizeString(statusOverride, 20).toLowerCase();
      const status = explicitStatus || "online";

      const payload = {
        admin_id: adminId,
        full_name: fullName || null,
        email,
        role,
        status,
        current_path: normalizedPath,
        device_type: getDeviceType(),
        last_active_at: nowIso,
        logged_in_at: loggedInAtRef.current || nowIso,
        session_id: sessionId,
      };

      const heartbeatDiagnostics = await buildHeartbeatDiagnostics({
        heartbeatNumber,
        heartbeatKind,
        status,
        payload,
      });

      logPresence("sending heartbeat", {
        ...heartbeatDiagnostics,
        payload,
        session: getSessionDiagnostics({ adminId, email, accessToken, role }),
      });

      networkContextRef.current = heartbeatDiagnostics;
      const heartbeatStartedAt = Date.now();
      let data = null;
      let upsertError = null;
      try {
        const response = await clientRef.current
          .from("admin_presence")
          .upsert(payload, { onConflict: "session_id" })
          .select("*")
          .limit(1);
        data = response.data;
        upsertError = response.error;
      } catch (error) {
        upsertError = error;
      } finally {
        networkContextRef.current = null;
      }

      if (upsertError) {
        setError(sanitizeString(upsertError.message || "Unable to update live admin presence.", 300));
        const failureEntry = recordHeartbeatDiagnostic(heartbeatDiagnostics, {
          ok: false,
          durationMs: Date.now() - heartbeatStartedAt,
          errorMessage: upsertError?.message || "",
          errorName: upsertError?.name || "",
          errorCode: upsertError?.code || "",
          errorStatus: upsertError?.status || upsertError?.statusCode || "",
        });
        logPresenceError("heartbeat error", upsertError, { payload, heartbeat: failureEntry || heartbeatDiagnostics });
        throw upsertError;
      }

      const successEntry = recordHeartbeatDiagnostic(heartbeatDiagnostics, {
        ok: true,
        durationMs: Date.now() - heartbeatStartedAt,
        returnedRows: Array.isArray(data) ? data.length : 0,
      });

      logPresence("heartbeat response", {
        ...(successEntry || heartbeatDiagnostics),
        returnedRows: Array.isArray(data) ? data.length : 0,
        rows: data,
      });

      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setRows((current) => mergePresenceRow(current, row));
        setLastSyncedAt(nowIso);
      }
    },
    [accessToken, adminId, buildHeartbeatDiagnostics, canRun, email, fullName, normalizedPath, role, sessionId],
  );

  const markOfflineBestEffort = useCallback(() => {
    if (!sessionId || !accessToken || !hasSupabasePresenceConfig) {
      logPresence("offline heartbeat skipped", {
        sessionIdPresent: Boolean(sessionId),
        accessTokenPresent: Boolean(accessToken),
        hasSupabasePresenceConfig,
      });
      return;
    }
    const { supabaseUrl, supabaseAnonKey } = getSupabasePresenceRestConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      logPresence("offline heartbeat missing REST config", {
        supabaseUrlPresent: Boolean(supabaseUrl),
        supabaseAnonKeyPresent: Boolean(supabaseAnonKey),
      });
      return;
    }
    const nowIso = new Date().toISOString();

    const endpoint = `${supabaseUrl}/rest/v1/admin_presence?session_id=eq.${encodeURIComponent(sessionId)}`;
    const heartbeatNumber = heartbeatCounterRef.current + 1;
    heartbeatCounterRef.current = heartbeatNumber;
    const offlineDiagnostics = {
      hookInstanceId: hookInstanceIdRef.current,
      clientInstanceId: clientInstanceIdRef.current,
      heartbeatNumber,
      heartbeatKind: "offline-keepalive",
      timestamp: nowIso,
      userId: adminId,
      email,
      role,
      status: "offline",
      currentPath: normalizedPath,
      sessionId,
      sessionExpiresAt: sanitizeString(session?.expiresAt, 80),
      jwtExpiresAt: getTokenDiagnostics(accessToken).jwtExpiresAt,
      accessTokenHashPrefix: accessTokenHashRef.current,
      supabaseUrl,
      requestUrl: endpoint,
      runtimeCounts: getActiveRuntimeCounts(),
    };
    logPresence("sending offline heartbeat", {
      ...offlineDiagnostics,
      endpoint,
      sessionId,
      nowIso,
      session: getSessionDiagnostics({ adminId, email, accessToken, role }),
    });
    fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "offline",
        last_active_at: nowIso,
      }),
      keepalive: true,
    })
      .then((response) => {
        recordHeartbeatDiagnostic(offlineDiagnostics, {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        });
        logPresence("offline heartbeat response", {
          ...offlineDiagnostics,
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
        });
      })
      .catch((error) => {
        const failureEntry = recordHeartbeatDiagnostic(offlineDiagnostics, {
          ok: false,
          errorMessage: error?.message || "",
          errorName: error?.name || "",
        });
        logPresenceError("offline heartbeat error", error, { endpoint, sessionId, heartbeat: failureEntry });
      });
  }, [accessToken, adminId, email, normalizedPath, role, session?.expiresAt, sessionId]);

  const fetchPresenceRows = useCallback(async () => {
    if (!canRun || !clientRef.current) {
      logPresence("presence fetch skipped", {
        canRun,
        hasClient: Boolean(clientRef.current),
        session: getSessionDiagnostics({ adminId, email, accessToken, role }),
      });
      return;
    }
    setLoading(true);
    setError("");
    logPresence("fetching presence rows", {
      session: getSessionDiagnostics({ adminId, email, accessToken, role }),
    });
    const { data, error: fetchError } = await clientRef.current
      .from("admin_presence")
      .select("*")
      .order("last_active_at", { ascending: false })
      .limit(200);
    setLoading(false);

    if (fetchError) {
      setError(sanitizeString(fetchError.message || "Unable to load live admin presence.", 300));
      logPresenceError("presence fetch error", fetchError);
      return;
    }

    logPresence("presence fetch response", {
      returnedRows: Array.isArray(data) ? data.length : 0,
      rows: data,
    });
    setRows(Array.isArray(data) ? data : []);
    setLastSyncedAt(new Date().toISOString());
  }, [accessToken, adminId, canRun, email, role]);

  const pruneOwnStalePresenceRows = useCallback(async () => {
    if (!canRun || !clientRef.current || !adminId) return;
    const cutoffIso = new Date(Date.now() - STALE_CLEANUP_WINDOW_MS).toISOString();
    const { error: cleanupError } = await clientRef.current
      .from("admin_presence")
      .delete()
      .eq("admin_id", adminId)
      .neq("session_id", sessionId)
      .lt("last_active_at", cutoffIso);

    if (cleanupError) {
      logPresenceError("stale presence cleanup error", cleanupError, { cutoffIso, adminId, sessionId });
    }
  }, [adminId, canRun, sessionId]);

  useEffect(() => {
    if (!canRun) {
      logPresence("heartbeat initialization stopped", {
        hookInstanceId: hookInstanceIdRef.current,
        enabled,
        canRun,
        hasSupabasePresenceConfig,
        session: getSessionDiagnostics({ adminId, email, accessToken, role }),
      });
      setRows([]);
      if (!hasSupabasePresenceConfig) {
        setError("Supabase presence is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      } else if (!accessToken) {
        setError("Admin access token is missing. Sign in again to enable live presence.");
      } else {
        setError("");
      }
      return undefined;
    }

    registerActiveHook(hookInstanceIdRef.current, {
      adminId,
      email,
      role,
      sessionId,
      currentPath: normalizedPath,
    });

    const clientInstanceId = getNextClientInstanceId();
    clientInstanceIdRef.current = clientInstanceId;
    const client = getSupabasePresenceClient(accessToken, { fetch: instrumentedFetch });
    if (!client) {
      setError("Unable to initialize Supabase client for presence.");
      logPresence("Supabase presence client unavailable", {
        hookInstanceId: hookInstanceIdRef.current,
        clientInstanceId,
        hasSupabasePresenceConfig,
        session: getSessionDiagnostics({ adminId, email, accessToken, role }),
      });
      unregisterActiveHook(hookInstanceIdRef.current);
      return undefined;
    }

    recordClientCreated({
      hookInstanceId: hookInstanceIdRef.current,
      clientInstanceId,
      adminId,
      email,
      role,
      sessionId,
      currentPath: normalizedPath,
      accessTokenHashPrefix: accessTokenHashRef.current,
      sessionExpiresAt: sanitizeString(session?.expiresAt, 80),
    });
    clientRef.current = client;
    client.realtime.setAuth(accessToken);
    const restConfig = getSupabasePresenceRestConfig();
    logPresence("heartbeat initialized", {
      hookInstanceId: hookInstanceIdRef.current,
      clientInstanceId,
      supabaseUrl: restConfig.supabaseUrl,
      supabaseAnonKeyPresent: Boolean(restConfig.supabaseAnonKey),
      realtimeAuthSet: true,
      channelName: `admin-presence:${sessionId}`,
      session: getSessionDiagnostics({ adminId, email, accessToken, role }),
      runtimeCounts: getActiveRuntimeCounts(),
    });

    const nowIso = new Date().toISOString();
    loggedInAtRef.current = persistedLoggedInAt || nowIso;
    lastInteractionAtRef.current = Date.now();

    const channel = client
      .channel(`admin-presence:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_presence" },
        (payload) => {
          logPresence("Realtime INSERT received", payload);
          setRows((current) => mergePresenceRow(current, payload.new || {}));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_presence" },
        (payload) => {
          logPresence("Realtime UPDATE received", payload);
          setRows((current) => mergePresenceRow(current, payload.new || {}));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "admin_presence" },
        (payload) => {
          logPresence("Realtime DELETE received", payload);
          setRows((current) => deletePresenceRow(current, payload.old || {}));
        },
      )
      .subscribe((status, error) => {
        logPresence("Realtime subscription status", { status, error });
        if (error) {
          logPresenceError("Realtime subscription error", error, { status });
        }
      });

    channelRef.current = channel;

    const pushActivity = () => {
      if (activityPushTimeoutRef.current) return;
      activityPushTimeoutRef.current = setTimeout(() => {
        activityPushTimeoutRef.current = null;
        upsertPresence({
          statusOverride: "online",
          heartbeatKind: "activity",
        }).catch((error) =>
          logPresenceError("activity heartbeat rejected", error),
        );
      }, ACTIVITY_PUSH_DEBOUNCE_MS);
    };

    const handleActivity = () => {
      lastInteractionAtRef.current = Date.now();
      pushActivity();
    };

    const handleVisibilityChange = () => {
      const status = "online";
      upsertPresence({ statusOverride: status, heartbeatKind: "visibility" }).catch((error) =>
        logPresenceError("visibility heartbeat rejected", error, { status }),
      );
    };

    const handlePageHide = () => {
      markOfflineBestEffort();
    };

    const listeners = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    listeners.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handlePageHide);
    window.addEventListener("pagehide", handlePageHide);

    fetchPresenceRows().catch((error) => logPresenceError("initial presence fetch rejected", error));
    upsertPresence({ statusOverride: "online", heartbeatKind: "initial" }).catch((error) =>
      logPresenceError("initial heartbeat rejected", error),
    );
    pruneOwnStalePresenceRows().catch((error) => logPresenceError("stale presence cleanup rejected", error));

    const intervalRuntimeId = `${hookInstanceIdRef.current}:interval:${Date.now()}`;
    const intervalId = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionAtRef.current;
      const computedStatus = "online";
      upsertPresence({ statusOverride: computedStatus, heartbeatKind: "interval" }).catch((error) =>
        logPresenceError("interval heartbeat rejected", error, { computedStatus, inactiveMs }),
      );
    }, HEARTBEAT_INTERVAL_MS);
    registerActiveInterval(intervalRuntimeId, {
      hookInstanceId: hookInstanceIdRef.current,
      clientInstanceId,
      adminId,
      email,
      sessionId,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      currentPath: normalizedPath,
    });
    logPresence("heartbeat interval started", {
      hookInstanceId: hookInstanceIdRef.current,
      clientInstanceId,
      intervalRuntimeId,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      runtimeCounts: getActiveRuntimeCounts(),
    });

    return () => {
      window.clearInterval(intervalId);
      unregisterActiveInterval(intervalRuntimeId);
      listeners.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handlePageHide);
      window.removeEventListener("pagehide", handlePageHide);
      if (activityPushTimeoutRef.current) {
        clearTimeout(activityPushTimeoutRef.current);
        activityPushTimeoutRef.current = null;
      }

      upsertPresence({ statusOverride: "offline", heartbeatKind: "cleanup" }).catch((error) =>
        logPresenceError("cleanup heartbeat rejected", error),
      );
      markOfflineBestEffort();
      if (channelRef.current && clientRef.current) {
        clientRef.current
          .removeChannel(channelRef.current)
          .catch((error) => logPresenceError("remove realtime channel rejected", error));
      }
      logPresence("heartbeat lifecycle cleaned up", {
        hookInstanceId: hookInstanceIdRef.current,
        clientInstanceId,
        intervalRuntimeId,
        runtimeCounts: getActiveRuntimeCounts(),
      });
      channelRef.current = null;
      unregisterActiveHook(hookInstanceIdRef.current);
    };
  }, [
    accessToken,
    adminId,
    canRun,
    email,
    enabled,
    fetchPresenceRows,
    instrumentedFetch,
    markOfflineBestEffort,
    normalizedPath,
    persistedLoggedInAt,
    pruneOwnStalePresenceRows,
    role,
    session?.expiresAt,
    sessionId,
    upsertPresence,
  ]);

  useEffect(() => {
    if (!canRun) return;
    upsertPresence({
      statusOverride: "online",
      heartbeatKind: "path",
    }).catch((error) =>
      logPresenceError("path heartbeat rejected", error, { normalizedPath }),
    );
  }, [canRun, normalizedPath, upsertPresence]);

  const decoratedRows = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          computed_status: getStatusFromRow(row),
          presence_age_ms: getPresenceAgeMs(row),
        }))
        .filter(isRecentPresenceRow),
    [rows],
  );

  const onlineCount = useMemo(
    () => decoratedRows.filter((row) => row.computed_status === "online").length,
    [decoratedRows],
  );

  const awayCount = useMemo(
    () => decoratedRows.filter((row) => row.computed_status === "away").length,
    [decoratedRows],
  );

  const offlineCount = useMemo(
    () => decoratedRows.filter((row) => row.computed_status === "offline").length,
    [decoratedRows],
  );

  return {
    loading,
    error,
    rows: decoratedRows,
    onlineCount,
    awayCount,
    offlineCount,
    lastSyncedAt,
    refreshNow: fetchPresenceRows,
    hasRealtime: canRun,
  };
};
