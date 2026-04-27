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

export async function handler(event) {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Method not allowed.</Say></Response>', 405);
  }

  const forwardTo = normalizePhoneNumber(
    sanitizeString(getEnv("TWILIO_VOICE_FORWARD_TO") || getEnv("OLS_CALL_FORWARD_TO"), 80),
  );

  if (forwardTo) {
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. Connecting you now.</Say><Dial><Number>${xmlEscape(
        forwardTo,
      )}</Number></Dial></Response>`,
    );
  }

  return xmlResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. Please send us a message and our team will respond shortly.</Say></Response>',
  );
}
