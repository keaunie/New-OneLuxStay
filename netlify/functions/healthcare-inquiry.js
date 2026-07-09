const RESERVATIONS_EMAIL = "reservations@oneluxstay.com";

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

const str = (value = "", maxLength = 500) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const multiline = (value = "", maxLength = 3000) =>
  String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeEmail = (value = "") => str(value, 320).toLowerCase();

const isEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const getRecipients = () =>
  Array.from(
    new Set(
      [
        process.env.HEALTHCARE_INQUIRY_TO,
        process.env.RESERVATIONS_INQUIRY_TO,
        RESERVATIONS_EMAIL,
      ]
        .flatMap((value) => String(value || "").split(","))
        .map(normalizeEmail)
        .filter(isEmail),
    ),
  );

const fieldRows = (rows = []) =>
  rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 10px 14px; color: #7a6a5d; border-bottom: 1px solid #eee4d8; width: 38%; font-size: 13px;">${escapeHtml(label)}</td>
          <td style="padding: 10px 14px; color: #241b15; border-bottom: 1px solid #eee4d8; font-size: 14px; font-weight: 600;">${escapeHtml(value || "-")}</td>
        </tr>
      `,
    )
    .join("");

const buildEmailHtml = (payload) => {
  const rows = [
    ["Number of bedrooms", payload.bedrooms],
    ["City", payload.city],
    ["Company name", payload.companyName],
    ["Inquiring for", payload.inquiringFor],
    ["Full name", payload.fullName],
    ["Email", payload.email],
    ["Phone", payload.phone],
    ["Budget per night", payload.budget],
    ["Check in", payload.checkIn],
    ["Check out", payload.checkOut],
    ["Adults", payload.adults],
    ["Children under 18", payload.children],
    ["Parking requested", payload.parking ? "Yes" : "No"],
    ["Pets", payload.pets ? "Yes" : "No"],
  ];

  return `
    <div style="margin: 0; padding: 0; background: #f2ede5; font-family: Arial, sans-serif; color: #241b15;">
      <div style="max-width: 720px; margin: 0 auto; padding: 34px 18px;">
        <div style="background: #fdfcfa; border: 1px solid #e3d7c8; border-radius: 18px; overflow: hidden;">
          <div style="padding: 28px 30px; background: #1c1814; color: #fdfcfa;">
            <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #d8c49a; margin-bottom: 10px;">Healthcare Inquiry</div>
            <h1 style="font-family: Georgia, serif; font-size: 30px; line-height: 1.1; margin: 0;">New OneLuxStay healthcare stay request</h1>
          </div>
          <div style="padding: 24px 30px 30px;">
            <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px;">
              ${fieldRows(rows)}
            </table>
            <div style="margin-top: 20px;">
              <div style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #9b7a38; margin-bottom: 8px;">Anything else?</div>
              <div style="white-space: pre-wrap; line-height: 1.7; color: #3d342b; border: 1px solid #eee4d8; background: #faf7f2; border-radius: 12px; padding: 16px;">${escapeHtml(payload.notes || "-")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `.trim();
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const payload = {
    bedrooms: str(body.bedrooms, 40),
    city: str(body.city, 120),
    companyName: str(body.companyName, 160),
    inquiringFor: str(body.inquiringFor, 80),
    fullName: str(body.fullName, 160),
    email: normalizeEmail(body.email),
    phone: str(body.phone, 80),
    budget: str(body.budget, 80),
    checkIn: str(body.checkIn, 40),
    checkOut: str(body.checkOut, 40),
    adults: str(body.adults, 20),
    children: str(body.children, 20),
    parking: Boolean(body.parking),
    pets: Boolean(body.pets),
    notes: multiline(body.notes, 3000),
  };

  if (!payload.fullName) return jsonResponse(400, { error: "Full name is required." });
  if (!isEmail(payload.email)) return jsonResponse(400, { error: "A valid email is required." });
  if (!payload.checkIn || !payload.checkOut) return jsonResponse(400, { error: "Check in and check out are required." });
  if (payload.checkOut <= payload.checkIn) return jsonResponse(400, { error: "Check out must be after check in." });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = getRecipients();

  if (!apiKey || !from || !recipients.length) {
    return jsonResponse(503, { error: "Email delivery is not configured." });
  }

  const subjectParts = ["Healthcare inquiry"];
  if (payload.city) subjectParts.push(payload.city);
  if (payload.checkIn) subjectParts.push(payload.checkIn);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: payload.email,
        subject: subjectParts.join(" - "),
        html: buildEmailHtml(payload),
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || "Unable to send inquiry email.");

    return jsonResponse(200, { ok: true, id: result?.id || null });
  } catch (error) {
    console.error("[healthcare-inquiry] email error:", error);
    return jsonResponse(500, { error: error?.message || "Unable to send inquiry email." });
  }
};
