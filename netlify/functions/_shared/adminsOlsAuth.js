import { fetchWithTimeout, getHeaderValue } from "./http.js";
import {
  getNormalizedUserRole,
  isAdminRole,
  isSuperAdminRole,
  logRoleDebug,
} from "../../../shared/adminRoles.js";

const ADMINS_OLS_ROLE = "admins_ols";
const ADMINS_OLS_SUPERADMIN_ROLE = "admins_ols_superadmin";
const SUPERADMIN_ROLE = "superadmin";

const trimTrailingSlash = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const parseBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

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

const parseAllowedSuperAdminEmails = () =>
  new Set(
    String(getEnv("ADMINS_OLS_SUPERADMIN_EMAILS") || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );

const getSharedKeyUser = () => ({
  id: "shared-key-admin",
  email: "shared-key@internal.local",
  fullName: "Shared Key Admin",
  role: ADMINS_OLS_ROLE,
  isSuperAdmin: true,
});

const summarizeUser = (user = {}) => {
  const normalizedRole = getNormalizedUserRole(user);

  return {
    id: sanitizeString(user?.id, 120),
    email: normalizeEmail(user?.email),
    fullName: sanitizeString(
      user?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.fullName || user?.email || "",
      160,
    ),
    role: sanitizeString(normalizedRole, 80),
    isSuperAdmin: userIsSuperAdmin(user),
  };
};

const userIsSuperAdmin = (user = {}) => {
  const email = normalizeEmail(user?.email);
  const appMetadata = user?.app_metadata || {};
  const superAdminEmails = parseAllowedSuperAdminEmails();
  const trustedRole = getNormalizedUserRole(user, { includeUserMetadata: false });

  if (appMetadata?.superadmin === true) return true;
  if (appMetadata?.admins_ols_superadmin === true) return true;
  if (isSuperAdminRole(trustedRole)) return true;
  if (superAdminEmails.size) return Boolean(email && superAdminEmails.has(email));

  // Security: do not trust user_metadata for superadmin checks by default, because users can edit it.
  // If you previously relied on user_metadata role flags, set ADMINS_OLS_TRUST_USER_METADATA_SUPERADMIN=true.
  if (parseBoolean(getEnv("ADMINS_OLS_TRUST_USER_METADATA_SUPERADMIN"), false)) {
    const userMetadata = user?.user_metadata || {};
    const userRole = sanitizeString(getNormalizedUserRole({ role: userMetadata?.role }), 80);
    if (userMetadata?.superadmin === true) return true;
    if (userMetadata?.admins_ols_superadmin === true) return true;
    if (isSuperAdminRole(userRole)) return true;
  }

  return false;
};

const userHasAdminRole = (user = {}) => {
  const email = normalizeEmail(user?.email);
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const allowedEmails = parseAllowedAdminEmails();
  const trustedRole = getNormalizedUserRole(user, { includeUserMetadata: false });
  const userRole = sanitizeString(getNormalizedUserRole({ role: userMetadata?.role }), 80);

  if (appMetadata?.admins_ols === true) return true;
  if (userMetadata?.admins_ols === true) return true;
  if (isAdminRole(trustedRole)) return true;
  if (isAdminRole(userRole)) return true;
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
    accessToken,
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

export const verifyAdminsOlsPassword = async ({ email = "", password = "" } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");

  if (!normalizedEmail) throw new Error("Email is required.");
  if (!normalizedPassword) throw new Error("Current password is required.");

  await callSupabaseAuth("token?grant_type=password", {
    method: "POST",
    body: {
      email: normalizedEmail,
      password: normalizedPassword,
    },
    useServiceRole: false,
  });

  return { ok: true };
};

export const updateAdminsOlsUserAccount = async ({ accessToken = "", fullName = "", password = "" } = {}) => {
  const normalizedAccessToken = sanitizeString(accessToken, 4000);
  const normalizedFullName = sanitizeString(fullName, 160);
  const normalizedPassword = String(password || "");
  const updateBody = {};

  if (!normalizedAccessToken) throw new Error("Authenticated admin access token is required.");

  if (normalizedPassword) {
    if (normalizedPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    updateBody.password = normalizedPassword;
  }

  if (normalizedFullName) {
    updateBody.data = {
      full_name: normalizedFullName,
      fullName: normalizedFullName,
    };
  }

  if (!updateBody.password && !updateBody.data) {
    throw new Error("No account updates were provided.");
  }

  const user = await callSupabaseAuth("user", {
    method: "PUT",
    accessToken: normalizedAccessToken,
    body: updateBody,
  });

  return verifyAdminUser(user);
};

export const inviteAdminsOlsUserByEmail = async ({
  email = "",
  fullName = "",
  role = ADMINS_OLS_ROLE,
  redirectTo = "",
  invitedBy = {},
} = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFullName = sanitizeString(fullName, 160);
  const normalizedRedirectTo = sanitizeString(redirectTo, 4000);
  const normalizedRole = sanitizeString(role, 80) || ADMINS_OLS_ROLE;

  if (!normalizedEmail) throw new Error("Invite email is required.");
  if (!normalizedFullName) throw new Error("Full name is required.");
  if (normalizedFullName.split(/\s+/).filter(Boolean).length < 2) {
    throw new Error("Full name must include first and last name.");
  }
  if (!normalizedRedirectTo) throw new Error("Invite redirect URL is required.");

  // Keep the metadata in user_metadata so we can verify this is an invited admin during invite acceptance.
  const invitedByEmail = normalizeEmail(invitedBy?.email);
  const invitedByName = sanitizeString(invitedBy?.fullName || invitedBy?.name || "", 160);
  const invitedAt = new Date().toISOString();

  const data = {
    full_name: normalizedFullName || normalizedEmail,
    admins_ols: true,
    role: normalizedRole,
    admins_ols_superadmin: normalizedRole === ADMINS_OLS_SUPERADMIN_ROLE || normalizedRole === SUPERADMIN_ROLE,
    invite_pending: true,
    invite_sent_at: invitedAt,
    invited_by_email: invitedByEmail || null,
    invited_by_name: invitedByName || null,
  };

  await callSupabaseAuth("invite", {
    method: "POST",
    useServiceRole: true,
    body: {
      email: normalizedEmail,
      data,
      // Compatibility: different GoTrue versions accept snake_case or camelCase.
      redirect_to: normalizedRedirectTo,
      redirectTo: normalizedRedirectTo,
    },
  });

  return {
    email: normalizedEmail,
    role: normalizedRole,
    invitedAt,
  };
};

export const generateAdminsOlsInviteLink = async ({
  email = "",
  data = {},
  redirectTo = "",
} = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRedirectTo = sanitizeString(redirectTo, 4000);

  if (!normalizedEmail) throw new Error("Invite email is required.");
  if (!normalizedRedirectTo) throw new Error("Invite redirect URL is required.");

  // Supabase/GoTrue admin generate link endpoint.
  // Payload shape can vary slightly by version, so we try a couple of known formats.
  // Some deployments expect `redirectTo` (camelCase) instead of `redirect_to` (snake_case).
  const attempts = [
    {
      type: "invite",
      email: normalizedEmail,
      options: {
        data,
        redirectTo: normalizedRedirectTo,
      },
    },
    {
      type: "invite",
      email: normalizedEmail,
      data,
      options: {
        redirectTo: normalizedRedirectTo,
      },
    },
    {
      type: "invite",
      email: normalizedEmail,
      data,
      redirectTo: normalizedRedirectTo,
    },
    {
      type: "invite",
      email: normalizedEmail,
      data,
      redirect_to: normalizedRedirectTo,
    },
    {
      type: "invite",
      email: normalizedEmail,
      options: {
        data,
        redirect_to: normalizedRedirectTo,
      },
    },
  ];

  let lastError = null;
  for (const body of attempts) {
    try {
      const payload = await callSupabaseAuth("admin/generate_link", {
        method: "POST",
        useServiceRole: true,
        body,
      });

      const actionLink = sanitizeString(
        payload?.action_link ||
          payload?.actionLink ||
          payload?.properties?.action_link ||
          payload?.properties?.actionLink ||
          "",
        4000,
      );
      if (!actionLink) {
        throw new Error("Supabase did not return an action_link for this invite.");
      }

      // hashed_token lets the accept page call POST /verify with token_hash (no email required).
      // The plain `token` OTP format requires an email field, which we don't want in the URL.
      const hashedToken = sanitizeString(
        payload?.hashed_token ||
          payload?.hashedToken ||
          payload?.properties?.hashed_token ||
          payload?.properties?.hashedToken ||
          "",
        4000,
      );

      // Supabase cloud's generate_link response does NOT embed the User object,
      // so payload?.id is undefined. Fall back to an admin email lookup.
      let userId = sanitizeString(payload?.id || payload?.user?.id || "", 120);
      if (!userId) {
        try {
          const usersPayload = await callSupabaseAuth(
            `admin/users?email=${encodeURIComponent(normalizedEmail)}&page=1&per_page=1`,
            { method: "GET", useServiceRole: true },
          );
          userId = sanitizeString(
            usersPayload?.users?.[0]?.id || (Array.isArray(usersPayload) ? usersPayload[0]?.id : null) || "",
            120,
          );
        } catch {
          // ignore — metadata update is best-effort
        }
      }

      // admin/generate_link only stores `data` in user_metadata when creating a NEW user.
      // For existing users it regenerates the OTP without touching user_metadata.
      // Explicitly force-set via admin API so invite_pending:true is always present at acceptance time.
      if (userId) {
        try {
          await callSupabaseAuth(`admin/users/${encodeURIComponent(userId)}`, {
            method: "PUT",
            useServiceRole: true,
            body: { user_metadata: { ...data, invite_pending: true } },
          });
          console.log("[invite-generate] user_metadata force-set", { userId });
        } catch (metaErr) {
          console.log("[invite-generate] user_metadata update failed (non-fatal)", String(metaErr?.message || metaErr));
        }
      } else {
        console.log("[invite-generate] could not resolve userId — skipping user_metadata force-set", { email: normalizedEmail });
      }

      return {
        email: normalizedEmail,
        actionLink,
        hashedToken,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to generate an invite link.");
};

export const acceptAdminsOlsInvite = async ({
  accessToken = "",
  refreshToken = "",
  inviteToken = "",
  inviteTokenHash = "",
  inviteType = "invite",
  fullName = "",
  password = "",
} = {}) => {
  let normalizedAccessToken = sanitizeString(accessToken, 4000);
  let normalizedRefreshToken = sanitizeString(refreshToken, 4000);
  const normalizedInviteToken = sanitizeString(inviteToken, 4000);
  const normalizedInviteTokenHash = sanitizeString(inviteTokenHash, 4000);
  const normalizedInviteType = sanitizeString(inviteType || "invite", 80).toLowerCase() || "invite";
  const normalizedFullName = sanitizeString(fullName, 160);
  const normalizedPassword = String(password || "");

  if (!normalizedAccessToken && !normalizedInviteToken && !normalizedInviteTokenHash) {
    throw new Error("Invite access token is required.");
  }
  if (!normalizedFullName) throw new Error("Full name is required.");
  if (normalizedFullName.split(/\s+/).filter(Boolean).length < 2) {
    throw new Error("Please enter your first and last name.");
  }
  if (!normalizedPassword || normalizedPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  console.log("[invite-accept] tokens", {
    hasAccessToken: Boolean(normalizedAccessToken),
    hasInviteToken: Boolean(normalizedInviteToken),
    hasInviteTokenHash: Boolean(normalizedInviteTokenHash),
    inviteType: normalizedInviteType,
  });

  if (!normalizedAccessToken) {
    const verifyBody = {
      type: normalizedInviteType,
      ...(normalizedInviteTokenHash ? { token_hash: normalizedInviteTokenHash } : { token: normalizedInviteToken }),
    };
    console.log("[invite-accept] calling verify", { usingTokenHash: Boolean(normalizedInviteTokenHash) });

    const verifiedInvite = await callSupabaseAuth("verify", {
      method: "POST",
      body: verifyBody,
    });

    normalizedAccessToken = sanitizeString(verifiedInvite?.access_token, 4000);
    normalizedRefreshToken = sanitizeString(verifiedInvite?.refresh_token, 4000);
    console.log("[invite-accept] verify result", {
      hasAccessToken: Boolean(normalizedAccessToken),
      hasRefreshToken: Boolean(normalizedRefreshToken),
    });
    if (!normalizedAccessToken) throw new Error("Unable to verify invite token.");
  }

  const user = await callSupabaseAuth("user", {
    method: "GET",
    accessToken: normalizedAccessToken,
  });

  // Must be an admin user; this also sanitizes.
  const verified = verifyAdminUser(user);

  const userMetadata = user?.user_metadata || {};
  console.log("[invite-accept] invite status", {
    invite_pending: userMetadata?.invite_pending,
    metadata_keys: Object.keys(userMetadata).join(","),
    userId: user?.id,
  });

  // Block only when invite_pending is explicitly false (written by a previous successful acceptance).
  // undefined means the metadata was never written — the OTP one-time-use guarantee covers this case.
  if (userMetadata?.invite_pending === false) {
    console.log("[invite-accept] blocking — invite_pending explicitly false (already accepted)");
    const error = new Error("This invite link has already been accepted. Please sign in on the login page.");
    error.statusCode = 409;
    throw error;
  }
  if (userMetadata?.invite_pending !== true) {
    console.log("[invite-accept] invite_pending not set — proceeding on OTP guarantee", {
      value: userMetadata?.invite_pending,
    });
  }

  const desiredRoleRaw = sanitizeString(userMetadata?.role || "", 80);
  const desiredRole = [ADMINS_OLS_SUPERADMIN_ROLE, SUPERADMIN_ROLE].includes(desiredRoleRaw)
    ? desiredRoleRaw
    : ADMINS_OLS_ROLE;

  // Call 1: Accept the invite by setting only the password.
  // Supabase GoTrue rejects any `data` fields on the OTP session used for invite acceptance.
  const updatedUser = await callSupabaseAuth("user", {
    method: "PUT",
    accessToken: normalizedAccessToken,
    body: { password: normalizedPassword },
  });
  console.log("[invite-accept] password update result", { userId: updatedUser?.id || user?.id });

  // Call 2: Now that the session is a normal session, update user metadata.
  await callSupabaseAuth("user", {
    method: "PUT",
    accessToken: normalizedAccessToken,
    body: {
      data: {
        ...(typeof userMetadata === "object" && userMetadata ? userMetadata : {}),
        invite_pending: false,
        invite_accepted_at: new Date().toISOString(),
        ...(normalizedFullName
          ? {
              full_name: normalizedFullName,
              fullName: normalizedFullName,
            }
          : {}),
      },
    },
  });
  console.log("[invite-accept] metadata update done");

  // Role hardening: promote app_metadata on the server so superadmin checks do not rely on user_metadata.
  // If this fails, we still allow admin access (via user_metadata.admins_ols), but superadmin capabilities may not apply.
  try {
    await callSupabaseAuth(`admin/users/${encodeURIComponent(String(user?.id || updatedUser?.id || ""))}`, {
      method: "PUT",
      useServiceRole: true,
      body: {
        app_metadata: {
          role: desiredRole,
          admins_ols: true,
          ...(desiredRole === ADMINS_OLS_SUPERADMIN_ROLE || desiredRole === SUPERADMIN_ROLE
            ? { superadmin: desiredRole === SUPERADMIN_ROLE, admins_ols_superadmin: true }
            : {}),
        },
      },
    });
  } catch {
    // ignore
  }

  return {
    access_token: normalizedAccessToken,
    refresh_token: normalizedRefreshToken,
    expires_in: 0,
    user: verifyAdminUser(updatedUser || verified),
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
  user: (() => {
    const appUser = summarizeUser(session?.user || {});
    logRoleDebug(session?.user || {}, appUser);
    return appUser;
  })(),
});
