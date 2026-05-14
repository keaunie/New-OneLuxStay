/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSupabasePresenceClient,
  getSupabasePresenceRestConfig,
  hasSupabasePresenceConfig,
} from "../utils/supabasePresenceClient";

const HEARTBEAT_INTERVAL_MS = 30_000;
const ACTIVITY_PUSH_DEBOUNCE_MS = 3_500;

const sanitizeString = (value = "", maxLength = 300) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

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

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStatusFromRow = (row = {}) => {
  const explicitStatus = sanitizeString(row?.status, 20).toLowerCase();
  if (explicitStatus === "offline") return "offline";
  const ageMs = Date.now() - toTimestamp(row?.last_active_at);
  if (ageMs <= 60_000) return "online";
  if (ageMs <= 300_000) return "away";
  return "offline";
};

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

  const adminId = sanitizeString(session?.user?.id, 120);
  const email = sanitizeString(session?.user?.email, 200).toLowerCase();
  const accessToken = sanitizeString(session?.accessToken, 4000);
  const fullName = sanitizeString(session?.user?.fullName, 160);
  const role = sanitizeString(session?.user?.role, 80) || "admin";
  const normalizedPath = sanitizeString(currentPath || "/", 240) || "/";
  const sessionId = useMemo(() => (adminId ? generateSessionId(adminId) : ""), [adminId]);

  const canRun = enabled && Boolean(adminId && email && accessToken && hasSupabasePresenceConfig);

  const upsertPresence = useCallback(
    async ({ statusOverride = "" } = {}) => {
      if (!canRun || !clientRef.current || !sessionId) return;

      const nowIso = new Date().toISOString();
      const explicitStatus = sanitizeString(statusOverride, 20).toLowerCase();
      const status = explicitStatus || (document.hidden ? "away" : "online");

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

      const { data, error: upsertError } = await clientRef.current
        .from("admin_presence")
        .upsert(payload, { onConflict: "session_id" })
        .select("*")
        .limit(1);

      if (upsertError) throw upsertError;
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setRows((current) => mergePresenceRow(current, row));
        setLastSyncedAt(nowIso);
      }
    },
    [adminId, canRun, email, fullName, normalizedPath, role, sessionId],
  );

  const markOfflineBestEffort = useCallback(() => {
    if (!sessionId || !accessToken || !hasSupabasePresenceConfig) return;
    const { supabaseUrl, supabaseAnonKey } = getSupabasePresenceRestConfig();
    if (!supabaseUrl || !supabaseAnonKey) return;
    const nowIso = new Date().toISOString();

    const endpoint = `${supabaseUrl}/rest/v1/admin_presence?session_id=eq.${encodeURIComponent(sessionId)}`;
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
    }).catch(() => null);
  }, [accessToken, sessionId]);

  const fetchPresenceRows = useCallback(async () => {
    if (!canRun || !clientRef.current) return;
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await clientRef.current
      .from("admin_presence")
      .select("*")
      .order("last_active_at", { ascending: false })
      .limit(200);
    setLoading(false);

    if (fetchError) {
      setError(sanitizeString(fetchError.message || "Unable to load live admin presence.", 300));
      return;
    }

    setRows(Array.isArray(data) ? data : []);
    setLastSyncedAt(new Date().toISOString());
  }, [canRun]);

  useEffect(() => {
    if (!canRun) {
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

    const client = getSupabasePresenceClient();
    if (!client) {
      setError("Unable to initialize Supabase client for presence.");
      return undefined;
    }

    clientRef.current = client;
    client.realtime.setAuth(accessToken);

    const nowIso = new Date().toISOString();
    loggedInAtRef.current = nowIso;
    lastInteractionAtRef.current = Date.now();

    const channel = client
      .channel(`admin-presence:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_presence" },
        (payload) => {
          setRows((current) => mergePresenceRow(current, payload.new || {}));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_presence" },
        (payload) => {
          setRows((current) => mergePresenceRow(current, payload.new || {}));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "admin_presence" },
        (payload) => {
          setRows((current) => deletePresenceRow(current, payload.old || {}));
        },
      )
      .subscribe();

    channelRef.current = channel;

    const pushActivity = () => {
      if (activityPushTimeoutRef.current) return;
      activityPushTimeoutRef.current = setTimeout(() => {
        activityPushTimeoutRef.current = null;
        upsertPresence({ statusOverride: document.hidden ? "away" : "online" }).catch(() => null);
      }, ACTIVITY_PUSH_DEBOUNCE_MS);
    };

    const handleActivity = () => {
      lastInteractionAtRef.current = Date.now();
      pushActivity();
    };

    const handleVisibilityChange = () => {
      const status = document.hidden ? "away" : "online";
      upsertPresence({ statusOverride: status }).catch(() => null);
    };

    const handlePageHide = () => {
      markOfflineBestEffort();
    };

    const listeners = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    listeners.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handlePageHide);
    window.addEventListener("pagehide", handlePageHide);

    fetchPresenceRows().catch(() => null);
    upsertPresence({ statusOverride: "online" }).catch(() => null);

    const intervalId = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionAtRef.current;
      const computedStatus = document.hidden || inactiveMs > 60_000 ? "away" : "online";
      upsertPresence({ statusOverride: computedStatus }).catch(() => null);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      listeners.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handlePageHide);
      window.removeEventListener("pagehide", handlePageHide);
      if (activityPushTimeoutRef.current) {
        clearTimeout(activityPushTimeoutRef.current);
        activityPushTimeoutRef.current = null;
      }

      upsertPresence({ statusOverride: "offline" }).catch(() => null);
      markOfflineBestEffort();
      if (channelRef.current && clientRef.current) {
        clientRef.current.removeChannel(channelRef.current).catch(() => null);
      }
      channelRef.current = null;
    };
  }, [accessToken, canRun, fetchPresenceRows, markOfflineBestEffort, sessionId, upsertPresence]);

  useEffect(() => {
    if (!canRun) return;
    upsertPresence({ statusOverride: document.hidden ? "away" : "online" }).catch(() => null);
  }, [canRun, normalizedPath, upsertPresence]);

  const decoratedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        computed_status: getStatusFromRow(row),
      })),
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
