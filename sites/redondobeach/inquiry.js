// Inquiry form on redondobeach.oneluxstay.com, served by the Cloudflare worker at POST /api/inquiry.
// Emails the reservations team through Resend. RESEND_API_KEY and RESEND_FROM_EMAIL are worker secrets.
const RECIPIENTS = ["reservations@oneluxstay.com", "ash@oneluxstay.com"];

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const str = (value = "", maxLength = 500) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const multiline = (value = "", maxLength = 3000) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
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

const isEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const row = ([label, value]) => `
  <tr>
    <td style="padding:10px 14px;color:#7a6a5d;border-bottom:1px solid #eee4d8;width:38%;font-size:13px;">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;color:#241b15;border-bottom:1px solid #eee4d8;font-size:14px;font-weight:600;">${escapeHtml(value || "-")}</td>
  </tr>`;

const buildHtml = (p) => `
  <div style="margin:0;padding:24px 12px;background:#f4f0ea;font-family:Arial,Helvetica,sans-serif;color:#2b231e;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dfd4c7;border-radius:16px;overflow:hidden;">
      <div style="padding:22px 28px;background:#211b17;color:#fff;font-family:Georgia,serif;font-size:20px;letter-spacing:.16em;">ONELUXSTAY · REDONDO BEACH</div>
      <div style="padding:28px;">
        <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 6px;">New stay inquiry</h1>
        <p style="margin:0 0 20px;color:#6b5d51;font-size:14px;">${escapeHtml(p.fullName)} is asking about a long-term stay${p.residence ? ` (${escapeHtml(p.residence)})` : ""}. Reply to this email to answer them directly.</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #eadfd4;">
          ${[
            ["Name", p.fullName],
            ["Email", p.email],
            ["Phone", p.phone],
            ["Residence", p.residence],
            ["Move-in date", p.moveIn],
            ["Length of stay", p.stayLength],
            ["Guests", p.guests],
          ].map(row).join("")}
        </table>
        <div style="margin-top:22px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9b7a47;">Message</div>
        <div style="white-space:pre-wrap;line-height:1.7;color:#443a32;border-left:3px solid #c9ab79;background:#f8f5f1;padding:14px 18px;margin-top:8px;">${escapeHtml(p.message || "No message.")}</div>
      </div>
      <div style="padding:14px 28px;background:#eee7df;color:#74675d;font-size:11px;text-align:center;">Sent from redondobeach.oneluxstay.com</div>
    </div>
  </div>`.trim();

export const handleInquiry = async (request, env) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  // Hidden field real visitors never fill in. Pretend success so bots move on.
  if (str(body.website, 100)) return jsonResponse(200, { ok: true });

  const payload = {
    fullName: str(body.fullName, 160),
    email: str(body.email, 320).toLowerCase(),
    phone: str(body.phone, 80),
    residence: str(body.residence, 160),
    moveIn: str(body.moveIn, 40),
    stayLength: str(body.stayLength, 60),
    guests: str(body.guests, 10),
    message: multiline(body.message, 3000),
  };

  if (!payload.fullName) return jsonResponse(400, { error: "Please add your name." });
  if (!isEmail(payload.email)) return jsonResponse(400, { error: "Please add a valid email." });
  if (!payload.moveIn) return jsonResponse(400, { error: "Please add your move-in date." });

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.error("[inquiry] RESEND_API_KEY / RESEND_FROM_EMAIL are not set on the worker");
    return jsonResponse(503, { error: "Email delivery is not configured." });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: RECIPIENTS,
        reply_to: payload.email,
        subject: `Long-term stay inquiry - Redondo Beach${payload.residence ? ` (${payload.residence})` : ""} - ${payload.fullName}`,
        html: buildHtml(payload),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || "Unable to send inquiry email.");
    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("[inquiry] email error:", error);
    return jsonResponse(500, { error: "We couldn't send your inquiry just now." });
  }
};
