import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import {
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
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "sign_up") {
      const session = await createAdminsOlsUser({
        email: payload?.email,
        password: payload?.password,
        fullName: payload?.fullName,
        inviteCode: payload?.inviteCode,
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "refresh") {
      const session = await refreshAdminsOlsSession({
        refreshToken: payload?.refreshToken,
      });
      return jsonResponse(200, { ok: true, session: formatAdminsOlsSession(session) }, event);
    }

    if (action === "shared_key") {
      const session = await signInAdminsOlsSharedKey({
        accessKey: payload?.accessKey,
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
