// Sends website chats (Lucy) to the Guestway guest inbox by email, so the team sees
// them in the Unified Inbox next to OTA and WhatsApp threads. Guestway's Open API
// cannot create a conversation for a visitor without a reservation, but any email
// to the guest inbox address becomes a "New Guest" conversation with notifications.
//
// To keep the inbox readable this does not email every message, only:
//   - the first message of a chat,
//   - a message where the guest shares an email address or phone number,
//   - a request for a person, or a reply where Lucy hands the chat to the team.
// Each email carries the whole chat so far.

const DEFAULT_GUESTWAY_INBOX = "archie-stay@in.gstw.io";
const SITE_URL = "https://oneluxstay.com";
const SEND_TIMEOUT_MS = 4000;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{7,}\d/;
const HUMAN_REQUEST_PATTERN =
  /\b(real person|human|agent|representative|someone from (the|your) team|talk to (someone|a person|the team)|call me|phone me|front desk|manager)\b/i;

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const fromAddress = () => {
  const configured = String(process.env.RESEND_FROM_EMAIL || "").trim();
  return (configured.match(/<([^>]+)>/) || [null, configured])[1].trim();
};

// Phone numbers have at least 9 digits; dates such as 2026-11-20 or 20/11/2026 are removed first.
const findPhone = (text) => {
  const withoutDates = String(text || "").replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, " ");
  const candidate = (withoutDates.match(new RegExp(PHONE_PATTERN, "g")) || []).find(
    (match) => match.replace(/\D/g, "").length >= 9,
  );
  return candidate ? candidate.trim() : "";
};

const notificationReason = ({ messages, latestUserMessage, mode }) => {
  const userMessages = messages.filter((message) => message.role === "user");
  const latest = String(latestUserMessage?.content || "");
  const earlier = userMessages.slice(0, -1).map((message) => String(message.content || "")).join("\n");

  if (userMessages.length === 1) return "New website chat";
  if (mode === "needs_attention") return "Lucy handed this chat to the team";
  if (HUMAN_REQUEST_PATTERN.test(latest)) return "Guest asked for the team";
  if (EMAIL_PATTERN.test(latest) && !EMAIL_PATTERN.test(earlier)) return "Guest shared an email address";
  if (findPhone(latest) && !findPhone(earlier)) return "Guest shared a phone number";
  return "";
};

export const notifyGuestwayOfWebsiteChat = async ({ messages = [], pageContext = {}, chatSessionId = "", reply = "", mode = "" }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  const inbox = String(process.env.GUESTWAY_INBOX_EMAIL || DEFAULT_GUESTWAY_INBOX).trim();
  if (!apiKey || !from || !inbox || process.env.GUESTWAY_CHAT_NOTIFY === "off") return;

  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const reason = notificationReason({ messages, latestUserMessage, mode });
  if (!reason) return;

  const allGuestText = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  const guestEmail = (allGuestText.match(EMAIL_PATTERN) || [])[0] || "";
  const guestPhone = findPhone(allGuestText);
  const visitor = `Visitor ${String(chatSessionId || "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "new"}`;
  const city = pageContext.city || "";
  const pageUrl = `${SITE_URL}${pageContext.pathname || "/"}`;

  const transcript = [...messages, ...(reply ? [{ role: "assistant", content: reply }] : [])]
    .map(
      (message) =>
        `<p style="margin:0 0 10px"><strong>${message.role === "assistant" ? "Lucy" : "Guest"}:</strong> ${escapeHtml(message.content)}</p>`,
    )
    .join("\n");

  const html = `<p><strong>${escapeHtml(reason)}</strong> on oneluxstay.com</p>
<p>
  Page: <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageContext.title || pageUrl)}</a><br>
  ${city ? `City: ${escapeHtml(city)}<br>` : ""}
  Guest email: ${escapeHtml(guestEmail || "not given")}<br>
  Guest phone: ${escapeHtml(guestPhone || "not given")}<br>
  Chat ID: ${escapeHtml(chatSessionId || "unknown")}
</p>
<hr>
${transcript}
<hr>
<p style="color:#777">Sent automatically by the website chatbot. To answer the guest, use the email or phone above${
    guestEmail ? " (replying to this email goes to the guest)" : ""
  }.</p>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Website chat · ${visitor} <${from}>`,
        to: [inbox],
        ...(guestEmail ? { reply_to: guestEmail } : {}),
        subject: `Website chat${city ? ` (${city})` : ""} · ${visitor}: ${reason}`,
        html,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[guestway-chat] Resend returned ${response.status}: ${detail.slice(0, 200)}`);
    }
  } catch (error) {
    console.warn(`[guestway-chat] notification failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
};
