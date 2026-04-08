import { fetchWithTimeout, getHeaderValue } from "./http.js";

const ADMINS_OLS_ROLE = "admins_ols";

const trimTrailingSlash = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeEmail = (value = "") => sanitizeString(value, 320).toLowerCase();

const getSupabaseAuthConfig = ({ requireServiceRole = true, requireAnon = true } = {}) => {
  const url = trimTrailingSlash(getEnv("SUPABASE_URL") || "");
  const anonKey = sanitizeString(getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY") || "", 800);
  const serviceRoleKey = sanitizeString(
    getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SERVICE_KEY") || "",
    800,
  );

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (requireAnon && !anonKey) throw new Error("Missing SUPABASE_ANON_KEY");
  if (requireServiceRole && !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
};

const buildSupabaseAuthUrl = (path = "") => {
  const { url } = getSupabaseAuthConfig({ requireServiceRole: false, requireAnon: false });
  return `${url}/auth/v1/${String(path || "").replace(/^\/+/, "")}`;
};

const parseAllowedAdminEmails = () =>
  new Set(
    String(getEnv("ADMINS_OLS_ALLOWED_EMAILS") || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );

const getSharedKeyUser = () => ({
  id: "shared-key-admin",
  email: "shared-key@internal.local",
  fullName: "Shared Key Admin",
  role: ADMINS_OLS_ROLE,
});

const summarizeUser = (user = {}) => ({
  id: sanitizeString(user?.id, 120),
  email: normalizeEmail(user?.email),
  fullName: sanitizeString(
    user?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.fullName || user?.email || "",
    160,
  ),
  role: sanitizeString(user?.role || user?.app_metadata?.role || "", 80),
});

const userHasAdminRole = (user = {}) => {
  const email = normalizeEmail(user?.email);
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const allowedEmails = parseAllowedAdminEmails();

  if (appMetadata?.admins_ols === true) return true;
  if (userMetadata?.admins_ols === true) return true;
  if (sanitizeString(appMetadata?.role, 80) === ADMINS_OLS_ROLE) return true;
  if (allowedEmails.size) return Boolean(email && allowedEmails.has(email));

  // If no allowlist is configured, trust authenticated users from this Supabase project.
  return Boolean(email);
};

const parseAuthResponse = async (response) => {
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.msg || payload?.message || payload?.error_description || payload?.error || "Auth request failed";
    const error = new Error(sanitizeString(message, 500));
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const callSupabaseAuth = async (
  path,
  {
    method = "GET",
    body,
    accessToken = "",
    useServiceRole = false,
    timeout = 12_000,
  } = {},
) => {
  const { anonKey, serviceRoleKey } = getSupabaseAuthConfig({
    requireServiceRole: useServiceRole,
    requireAnon: !useServiceRole,
  });
  const apiKey = useServiceRole ? serviceRoleKey : anonKey || serviceRoleKey;
  const authToken = sanitizeString(accessToken, 4000) || apiKey;

  const response = await fetchWithTimeout(
    buildSupabaseAuthUrl(path),
    {
      method,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    timeout,
  );

  return parseAuthResponse(response);
};

const readBearerToken = (event = {}) => {
  const auth = sanitizeString(getHeaderValue(event, "authorization"), 4200);
  const match = auth.match(/^bearer\s+(.+)$/i);
  return sanitizeString(match?.[1] || "", 4000);
};

const resolveSharedAdminKey = () =>
  sanitizeString(getEnv("ADMINS_OLS_ACCESS_KEY") || getEnv("OLS_ADMIN_ACCESS_KEY") || "", 240);

const readProvidedAdminKey = (event = {}) => sanitizeString(getHeaderValue(event, "x-admin-key"), 240);

const verifyAdminUser = (user = {}) => {
  if (!userHasAdminRole(user)) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
  return summarizeUser(user);
};

export const verifyAdminsOlsAccess = async (event = {}) => {
  const configuredSharedKey = resolveSharedAdminKey();
  const providedSharedKey = readProvidedAdminKey(event);
  if (configuredSharedKey && providedSharedKey && providedSharedKey === configuredSharedKey) {
    return {
      mode: "shared_key",
      user: getSharedKeyUser(),
    };
  }

  const accessToken = readBearerToken(event);
  if (!accessToken) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }

  const user = await callSupabaseAuth("user", {
    method: "GET",
    accessToken,
  });

  return {
    mode: "supabase_auth",
    user: verifyAdminUser(user),
  };
};

export const signInAdminsOlsUser = async ({ email = "", password = "" } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");

  if (!normalizedEmail) throw new Error("Email is required.");
  if (!normalizedPassword) throw new Error("Password is required.");

  const session = await callSupabaseAuth("token?grant_type=password", {
    method: "POST",
    body: {
      email: normalizedEmail,
      password: normalizedPassword,
    },
    useServiceRole: false,
  });

  const user = await callSupabaseAuth("user", {
    method: "GET",
    accessToken: sanitizeString(session?.access_token, 4000),
  });

  return {
    ...session,
    user: verifyAdminUser(user),
  };
};

export const refreshAdminsOlsSession = async ({ refreshToken = "" } = {}) => {
  const normalizedRefreshToken = sanitizeString(refreshToken, 4000);
  if (!normalizedRefreshToken) throw new Error("Refresh token is required.");

  const session = await callSupabaseAuth("token?grant_type=refresh_token", {
    method: "POST",
    body: {
      refresh_token: normalizedRefreshToken,
    },
    useServiceRole: false,
  });

  const user = await callSupabaseAuth("user", {
    method: "GET",
    accessToken: sanitizeString(session?.access_token, 4000),
  });

  return {
    ...session,
    user: verifyAdminUser(user),
  };
};

export const createAdminsOlsUser = async ({
  email = "",
  password = "",
  fullName = "",
  inviteCode = "",
} = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");
  const normalizedFullName = sanitizeString(fullName, 160);
  const normalizedInviteCode = sanitizeString(inviteCode, 240);
  const expectedInviteCode = sanitizeString(getEnv("ADMINS_OLS_SIGNUP_KEY") || getEnv("ADMINS_OLS_ACCESS_KEY") || "", 240);

  if (!expectedInviteCode) {
    throw new Error("ADMINS_OLS_SIGNUP_KEY is not configured on the server.");
  }
  if (!normalizedEmail) throw new Error("Email is required.");
  if (!normalizedPassword || normalizedPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (!normalizedInviteCode || normalizedInviteCode !== expectedInviteCode) {
    const error = new Error("Invalid admin invite code.");
    error.statusCode = 403;
    throw error;
  }

  await callSupabaseAuth("admin/users", {
    method: "POST",
    useServiceRole: true,
    body: {
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedFullName || normalizedEmail,
        admins_ols: true,
      },
      app_metadata: {
        role: ADMINS_OLS_ROLE,
        admins_ols: true,
      },
    },
  });

  return signInAdminsOlsUser({
    email: normalizedEmail,
    password: normalizedPassword,
  });
};

export const signInAdminsOlsSharedKey = ({ accessKey = "" } = {}) => {
  const normalizedAccessKey = sanitizeString(accessKey, 240);
  const configuredSharedKey = resolveSharedAdminKey();

  if (!configuredSharedKey) {
    throw new Error("ADMINS_OLS_ACCESS_KEY is not configured on the server.");
  }
  if (!normalizedAccessKey || normalizedAccessKey !== configuredSharedKey) {
    const error = new Error("Invalid admin access key.");
    error.statusCode = 403;
    throw error;
  }

  return {
    shared_key: configuredSharedKey,
    user: getSharedKeyUser(),
  };
};

export const formatAdminsOlsSession = (session = {}) => ({
  accessToken: sanitizeString(session?.access_token, 4000),
  refreshToken: sanitizeString(session?.refresh_token, 4000),
  sharedKey: sanitizeString(session?.shared_key || session?.sharedKey, 240),
  expiresIn: Number.isFinite(Number(session?.expires_in)) ? Number(session.expires_in) : 0,
  expiresAt:
    Number.isFinite(Number(session?.expires_in)) && Number(session.expires_in) > 0
      ? new Date(Date.now() + Number(session.expires_in) * 1000).toISOString()
      : "",
  user: summarizeUser(session?.user || {}),
});
