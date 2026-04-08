const STORAGE_KEY = "ols-admins-ols-session";

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.sessionStorage);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const normalizeSession = (value = {}) => {
  const accessToken = sanitizeString(value?.accessToken, 4000);
  const sharedKey = sanitizeString(value?.sharedKey, 240);
  const refreshToken = sanitizeString(value?.refreshToken, 4000);
  const expiresAt = sanitizeString(value?.expiresAt, 80);

  if (!accessToken && !sharedKey) return null;

  return {
    accessToken,
    sharedKey,
    refreshToken,
    expiresIn: Number.isFinite(Number(value?.expiresIn)) ? Number(value.expiresIn) : 0,
    expiresAt,
    user: {
      id: sanitizeString(value?.user?.id, 120),
      email: sanitizeString(value?.user?.email, 200),
      fullName: sanitizeString(value?.user?.fullName, 160),
      role: sanitizeString(value?.user?.role, 80),
    },
  };
};

export const loadAdminsOlsSession = () => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const saveAdminsOlsSession = (value) => {
  const session = normalizeSession(value);
  if (!canUseStorage()) return session;

  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage failures
  }

  return session;
};

export const clearAdminsOlsSession = () => {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

export const getAdminsOlsAuthHeaders = (session) => {
  const normalized = normalizeSession(session);
  if (!normalized) return {};
  if (normalized.accessToken) {
    return {
      Authorization: `Bearer ${normalized.accessToken}`,
    };
  }
  if (normalized.sharedKey) {
    return {
      "X-Admin-Key": normalized.sharedKey,
    };
  }
  return {};
};

export const refreshAdminsOlsSession = async (apiBase, sessionOverride = null) => {
  const currentSession = normalizeSession(sessionOverride) || loadAdminsOlsSession();
  if (currentSession?.sharedKey && !currentSession?.refreshToken) return currentSession;
  if (!currentSession?.refreshToken) return null;

  const response = await fetch(`${apiBase}/admins-ols-auth`, {
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
    clearAdminsOlsSession();
    return null;
  }

  return saveAdminsOlsSession(payload.session);
};

export const isAdminsOlsSessionExpired = (session, { skewMs = 60_000 } = {}) => {
  const normalized = normalizeSession(session);
  if (!normalized?.expiresAt) return false;
  const expiresAt = new Date(normalized.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= Date.now() + Math.max(0, Number(skewMs) || 0);
};
