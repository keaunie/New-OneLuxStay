import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { logAdminsOlsActivity } from "./_shared/adminsOlsActivity.js";
import {
  acceptAdminsOlsInvite,
  createAdminsOlsUser,
  formatAdminsOlsSession,
  refreshAdminsOlsSession,
  signInAdminsOlsSharedKey,
  signInAdminsOlsUser,
} from "./_shared/adminsOlsAuth.js";

dotenv.config();

const sanitizeString = (value = "", maxLength = 500) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const getHeaders = (event = {}) => ({
  ...buildAiCorsHeaders(event),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const jsonResponse = (statusCode, body, event) => ({
  statusCode,
  headers: getHeaders(event),
  body: JSON.stringify(body),
});

const safeLogAdminsOlsActivity = async (input) => {
  try {
    await logAdminsOlsActivity(input);
  } catch {
    // Audit logging should never block admin auth flows.
  }
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: getHeaders(event),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, event);
  }

  const action = sanitizeString(payload?.action, 60).toLowerCase();

  try {
    if (action === "sign_in") {
      const session = await signInAdminsOlsUser({
        email: payload?.email,
        password: payload?.password,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "sign_in",
        message: "Signed in to the Concierge Intelligence Panel.",
        details: {
          entryPoint: "admins_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "sign_up") {
      const session = await createAdminsOlsUser({
        email: payload?.email,
        password: payload?.password,
        fullName: payload?.fullName,
        inviteCode: payload?.inviteCode,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "sign_up",
        message: "Created and signed in with a new admin account.",
        details: {
          entryPoint: "admins_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "refresh") {
      const session = await refreshAdminsOlsSession({
        refreshToken: payload?.refreshToken,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "session_refresh",
        message: "Refreshed the admin authentication session.",
        details: {
          entryPoint: "admins_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "shared_key") {
      const session = await signInAdminsOlsSharedKey({
        accessKey: payload?.accessKey,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: session?.user,
        authMode: "shared_key",
        eventType: "sign_in",
        message: "Signed in with the shared admin key.",
        details: {
          entryPoint: "admins_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "accept_invite") {
      const session = await acceptAdminsOlsInvite({
        accessToken: payload?.accessToken,
        refreshToken: payload?.refreshToken,
        inviteToken: payload?.inviteToken,
        inviteTokenHash: payload?.inviteTokenHash,
        inviteType: payload?.inviteType,
        fullName: payload?.fullName,
        password: payload?.password,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "invite_accepted",
        message: "Accepted an admin invitation and set an account password.",
        details: {
          entryPoint: "admins_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    return jsonResponse(400, { error: "Unsupported action" }, event);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    return jsonResponse(
      statusCode,
      { error: sanitizeString(error?.message || "Admin auth request failed", 500) },
      event,
    );
  }
}
