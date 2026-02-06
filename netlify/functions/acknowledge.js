import crypto from "crypto";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const base64url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const signJwt = (header, payload, privateKey) => {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(privateKey, "base64");
  const encodedSignature = signature
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${encodedSignature}`;
};

const getGoogleAccessToken = async () => {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google Sheets credentials.");
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    privateKey.replace(/\\n/g, "\n")
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error_description || "Unable to authenticate with Google.");
  }

  return payload.access_token;
};

const appendToSheet = async (row) => {
  const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || "Acknowledgements";
  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEETS_SHEET_ID.");
  }

  const token = await getGoogleAccessToken();
  const range = encodeURIComponent(`${sheetName}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error?.message || "Unable to write to Google Sheets.");
  }

  return payload;
};

const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.message || "Unable to send email.");
  }
  return payload;
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method not allowed" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { message: "Invalid payload." });
  }

  const {
    fullName,
    email,
    acceptedAt,
    consentText,
    listingId,
    reservationId,
    checkIn,
    checkOut,
    amount,
    city,
    userAgent,
    page,
  } = body || {};

  if (!fullName || !email || !acceptedAt || !consentText) {
    return jsonResponse(400, { message: "Missing required fields." });
  }

  const row = [
    new Date().toISOString(),
    fullName,
    email,
    acceptedAt,
    consentText,
    reservationId || "",
    listingId || "",
    city || "",
    checkIn || "",
    checkOut || "",
    amount || "",
    userAgent || "",
    page || "",
    event.headers?.["x-forwarded-for"] || "",
  ];

  try {
    await appendToSheet(row);
  } catch (err) {
    return jsonResponse(500, { message: err.message || "Failed to save record." });
  }

  let emailError = null;
  try {
    await sendEmail({
      to: email,
      subject: "OneLuxStay Authorization Acknowledgement",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #3f3326;">
          <h2>Authorization Acknowledgement</h2>
          <p>Thank you, ${fullName}. Your acknowledgement has been recorded.</p>
          <p><strong>Statement:</strong> ${consentText}</p>
          <p><strong>Date:</strong> ${new Date(acceptedAt).toLocaleString()}</p>
          ${reservationId ? `<p><strong>Reservation ID:</strong> ${reservationId}</p>` : ""}
          ${listingId ? `<p><strong>Listing ID:</strong> ${listingId}</p>` : ""}
          ${city ? `<p><strong>City:</strong> ${city}</p>` : ""}
          ${checkIn ? `<p><strong>Check-in:</strong> ${checkIn}</p>` : ""}
          ${checkOut ? `<p><strong>Check-out:</strong> ${checkOut}</p>` : ""}
          ${amount ? `<p><strong>Total:</strong> ${amount}</p>` : ""}
          <p>If you have questions, reply to this email.</p>
        </div>
      `,
    });
  } catch (err) {
    emailError = err.message;
  }

  return jsonResponse(200, { ok: true, emailError });
}
