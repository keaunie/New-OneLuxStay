import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePhoneNumber = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const xmlEscape = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const xmlResponse = (body = "", statusCode = 200) => ({
  statusCode,
  headers: {
    "Content-Type": "text/xml; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body,
});

const buildVoiceBridgeSignature = ({ guestNumber = "", fromNumber = "", secret = "" } = {}) =>
  crypto.createHmac("sha256", String(secret || "missing-secret")).update(`${guestNumber}|${fromNumber}`).digest("hex");

const readQueryValue = (event = {}, key = "") => {
  const params = event.queryStringParameters || {};
  return sanitizeString(params?.[key], 240);
};

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Method not allowed.</Say></Response>', 405);
  }

  const guestNumber = normalizePhoneNumber(readQueryValue(event, "guest"));
  const fromNumber = normalizePhoneNumber(readQueryValue(event, "from"));
  const signature = sanitizeString(readQueryValue(event, "sig"), 200);
  const secret = sanitizeString(
    getEnv("TWILIO_VOICE_BRIDGE_SECRET") || getEnv("TWILIO_VOICE_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"),
    240,
  );

  const expectedSignature = buildVoiceBridgeSignature({
    guestNumber,
    fromNumber,
    secret,
  });

  if (!guestNumber || !fromNumber || !signature || !secret || signature !== expectedSignature) {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call authorization failed.</Say></Response>', 403);
  }

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you to the guest now.</Say><Dial callerId="${xmlEscape(
      fromNumber,
    )}"><Number>${xmlEscape(guestNumber)}</Number></Dial></Response>`,
  );
}
