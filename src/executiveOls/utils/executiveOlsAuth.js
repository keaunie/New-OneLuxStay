import apiBase from "../../utils/apiBase";
import {
  clearAdminsOlsSession,
  getAdminsOlsAuthHeaders,
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
} from "../../utils/adminsOlsAuth";
import { getNormalizedUserRole, logRoleDebug, userHasSuperAdminRole } from "../../../shared/adminRoles.js";

const STORAGE_KEY = "ols-executive-ols-session";

const canUseStorage = () =>
  typeof window !== "undefined" && (Boolean(window.localStorage) || Boolean(window.sessionStorage));

const readBrowserStorage = (key) => {
  if (!canUseStorage()) return "";

  try {
    const localValue = window.localStorage?.getItem(key);
    if (localValue) return localValue;
  } catch {
    // ignore localStorage read failures
  }

  try {
    return window.sessionStorage?.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeBrowserStorage = (key, value) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // ignore localStorage write failures
  }

  try {
    window.sessionStorage?.setItem(key, value);
  } catch {
    // ignore sessionStorage write failures
  }
};

const removeBrowserStorage = (key) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage?.removeItem(key);
  } catch {
    // ignore localStorage remove failures
  }

  try {
    window.sessionStorage?.removeItem(key);
  } catch {
    // ignore sessionStorage remove failures
  }
};

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const normalizeSession = (value = {}) => {
  const accessToken = sanitizeString(value?.accessToken, 4000);
  const refreshToken = sanitizeString(value?.refreshToken, 4000);
  const expiresAt = sanitizeString(value?.expiresAt, 80);

  if (!accessToken) return null;

  const role = sanitizeString(getNormalizedUserRole(value?.user || {}), 80);
  const appUser = {
    id: sanitizeString(value?.user?.id, 120),
    email: sanitizeString(value?.user?.email, 200),
    fullName: sanitizeString(value?.user?.fullName, 160),
    role,
    isSuperAdmin: userHasSuperAdminRole({
      ...(value?.user || {}),
      role,
    }),
  };

  logRoleDebug(value?.user || {}, appUser);

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(Number(value?.expiresIn)) ? Number(value.expiresIn) : 0,
    expiresAt,
    user: appUser,
  };
};

export const loadExecutiveOlsSession = () => {
  if (!canUseStorage()) return null;

  try {
    const raw = readBrowserStorage(STORAGE_KEY);
    if (!raw) return loadAdminsOlsSession();
    const session = normalizeSession(JSON.parse(raw));
    if (session) {
      writeBrowserStorage(STORAGE_KEY, JSON.stringify(session));
      return session;
    }
    return loadAdminsOlsSession();
  } catch {
    return loadAdminsOlsSession();
  }
};

export const saveExecutiveOlsSession = (value) => {
  const session = normalizeSession(value);
  if (!canUseStorage()) return session;

  try {
    if (!session) {
      removeBrowserStorage(STORAGE_KEY);
      return null;
    }
    writeBrowserStorage(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage failures
  }

  return session;
};

export const clearExecutiveOlsSession = () => {
  clearAdminsOlsSession();
  if (!canUseStorage()) return;
  try {
    removeBrowserStorage(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

export const getExecutiveOlsAuthHeaders = (session) => {
  const normalized = normalizeSession(session);
  if (!normalized?.accessToken) return getAdminsOlsAuthHeaders(session);
  return {
    Authorization: `Bearer ${normalized.accessToken}`,
  };
};

export const refreshExecutiveOlsSession = async (sessionOverride = null) => {
  const currentSession = normalizeSession(sessionOverride) || loadExecutiveOlsSession();
  if (!currentSession?.refreshToken) return null;

  const adminSession = loadAdminsOlsSession();
  if (adminSession?.accessToken === currentSession.accessToken) {
    return refreshAdminsOlsSession(apiBase, adminSession);
  }

  const response = await fetch(`${apiBase}/executive-ols-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "refresh",
      refreshToken: currentSession.refreshToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.session) {
    clearExecutiveOlsSession();
    return null;
  }

  return saveExecutiveOlsSession(payload.session);
};

export const isExecutiveOlsSessionExpired = (session, { skewMs = 60_000 } = {}) => {
  const normalized = normalizeSession(session);
  if (!normalized?.accessToken) return isAdminsOlsSessionExpired(session, { skewMs });
  if (!normalized?.expiresAt) return false;
  const expiresAt = new Date(normalized.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= Date.now() + Math.max(0, Number(skewMs) || 0);
};
