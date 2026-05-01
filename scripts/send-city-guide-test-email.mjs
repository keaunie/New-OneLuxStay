import "dotenv/config";
import { buildCityGuideEmailTemplate } from "../netlify/functions/_shared/cityGuideEmailTemplate.js";

const argv = process.argv.slice(2);

const readFlag = (name, fallback = "") => {
  const idx = argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const token = argv[idx];
  if (token.includes("=")) return token.split("=").slice(1).join("=");
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
};

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;

const to = readFlag("to", "");
const citySlug = readFlag("city", "dubai");
const fullName = readFlag("name", "Guest");
const checkIn = readFlag("checkIn", "");
const checkOut = readFlag("checkOut", "");
const reservationId = readFlag("reservationId", "OLS-TEST");
const baseUrl = readFlag("baseUrl", process.env.PUBLIC_SITE_URL || "https://oneluxstay.com");

if (!to) {
  console.error("Missing --to email address");
  process.exit(1);
}

if (!apiKey || !from) {
  console.error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL in environment (.env / Netlify env vars).");
  process.exit(1);
}

const template = buildCityGuideEmailTemplate({
  baseUrl,
  citySlug,
  fullName,
  checkIn,
  checkOut,
  reservationId,
});

if (template?.skipped) {
  console.error(`Template skipped: ${template?.reason || "Unknown reason"}`);
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);

try {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    }),
    signal: controller.signal,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Resend error (${res.status}): ${payload?.message || JSON.stringify(payload)}`);
    process.exit(1);
  }

  console.log("Sent ✅");
  console.log(`To: ${to}`);
  console.log(`Subject: ${template.subject}`);
  console.log(`Guide: ${template.guideUrl}`);
  console.log(`Resend id: ${payload?.id || "(unknown)"}`);
} catch (err) {
  console.error(`Send failed: ${err?.message || String(err)}`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}

