const getHeaderValue = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();

  for (const [key, value] of Object.entries(event.headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  for (const [key, value] of Object.entries(event.multiValueHeaders || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  return "";
};

const parseFormBody = (event = {}) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "");
  const params = new URLSearchParams(rawBody);

  return Object.fromEntries(params.entries());
};

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Twilio-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const payload = parseFormBody(event);

  console.info("Twilio WhatsApp status callback", {
    messageSid: String(payload?.MessageSid || ""),
    messageStatus: String(payload?.MessageStatus || ""),
    to: String(payload?.To || ""),
    from: String(payload?.From || ""),
    errorCode: String(payload?.ErrorCode || ""),
    signaturePresent: Boolean(getHeaderValue(event, "x-twilio-signature")),
  });

  return jsonResponse(200, { ok: true });
}
