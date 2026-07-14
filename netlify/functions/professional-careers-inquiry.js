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
  const inquiryLabel = payload.industry || "Healthcare Professionals";
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
    <div style="margin:0;padding:0;background:#f4f0ea;font-family:Arial,Helvetica,sans-serif;color:#2b231e;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">New ${escapeHtml(inquiryLabel)} stay inquiry for ${escapeHtml(payload.city || "OneLuxStay")}</div>
      <div style="max-width:720px;margin:0 auto;padding:40px 18px;">
        <div style="background:#fff;border:1px solid #dfd4c7;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(45,35,28,.10);">
          <div style="padding:22px 32px;background:#211b17;border-bottom:1px solid #3c312a;">
            <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
              <td style="color:#fff;font-family:Georgia,serif;font-size:21px;font-weight:bold;letter-spacing:.18em;">ONELUXSTAY</td>
              <td align="right" style="color:#cdb58f;font-size:10px;letter-spacing:.15em;text-transform:uppercase;">Professional Stays</td>
            </tr></table>
          </div>
          <div style="padding:34px 32px 30px;background:#2b241f;color:#fff;">
            <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#d6bd94;margin-bottom:12px;">New inquiry · ${escapeHtml(inquiryLabel)}</div>
            <h1 style="font-family:Georgia,serif;font-size:32px;font-weight:normal;line-height:1.15;margin:0 0 12px;">A new stay request has arrived</h1>
            <p style="margin:0;color:#d8d0c9;font-size:14px;line-height:1.6;">${escapeHtml(payload.fullName)} is requesting accommodation${payload.city ? ` in ${escapeHtml(payload.city)}` : ""}.</p>
          </div>
          <div style="padding:30px 32px 34px;">
            <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9b7a47;margin:0 0 12px;">Inquiry details</div>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 28px;border:1px solid #eadfd4;border-radius:12px;overflow:hidden;">
              ${fieldRows(rows)}
            </table>
            <div>
              <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9b7a47;margin-bottom:10px;">Additional information</div>
              <div style="white-space:pre-wrap;line-height:1.7;color:#443a32;border-left:3px solid #c9ab79;background:#f8f5f1;border-radius:0 10px 10px 0;padding:18px 20px;">${escapeHtml(payload.notes || "No additional information provided.")}</div>
            </div>
          </div>
          <div style="padding:18px 32px;background:#eee7df;color:#74675d;font-size:11px;line-height:1.6;text-align:center;">Submitted through OneLuxStay Professional Stays<br><span style="color:#9a815d;">The Art of Luxurious Stays</span></div>
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
    industry: str(body.industry, 100) || "Healthcare Professionals",
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

  const subjectParts = [`${payload.industry} inquiry`];
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
    console.error("[professional-careers-inquiry] email error:", error);
    return jsonResponse(500, { error: error?.message || "Unable to send inquiry email." });
  }
};
