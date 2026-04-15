import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { logAdminsOlsActivity } from "./_shared/adminsOlsActivity.js";
import {
  formatAdminsOlsSession,
  refreshAdminsOlsSession,
  signInAdminsOlsUser,
} from "./_shared/adminsOlsAuth.js";

dotenv.config();

const sanitizeString = (value = "", maxLength = 500) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeEmail = (value = "") => sanitizeString(value, 320).toLowerCase();

const parseAllowedExecutiveEmails = () =>
  new Set(
    String(process.env.EXECUTIVE_OLS_ALLOWED_EMAILS || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );

const enforceExecutiveAccess = (session = {}) => {
  const email = normalizeEmail(session?.user?.email);
  const allowedEmails = parseAllowedExecutiveEmails();
  if (!allowedEmails.size) return session;
  if (email && allowedEmails.has(email)) return session;

  const error = new Error("Executive access required.");
  error.statusCode = 403;
  throw error;
};

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

const safeLogActivity = async (input) => {
  try {
    await logAdminsOlsActivity(input);
  } catch {
    // Logging should not block executive auth.
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
      const session = enforceExecutiveAccess(
        await signInAdminsOlsUser({
          email: payload?.email,
          password: payload?.password,
        }),
      );
      await safeLogActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "sign_in",
        message: "Signed in to the Executive Dashboard.",
        details: {
          entryPoint: "executive_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "refresh") {
      const session = enforceExecutiveAccess(
        await refreshAdminsOlsSession({
          refreshToken: payload?.refreshToken,
        }),
      );
      await safeLogActivity({
        event,
        actor: session?.user,
        authMode: "supabase_auth",
        eventType: "session_refresh",
        message: "Refreshed the executive authentication session.",
        details: {
          entryPoint: "executive_ols_auth",
        },
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    return jsonResponse(400, { error: "Unsupported action" }, event);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    return jsonResponse(
      statusCode,
      { error: sanitizeString(error?.message || "Executive auth request failed", 500) },
      event,
    );
  }
}
