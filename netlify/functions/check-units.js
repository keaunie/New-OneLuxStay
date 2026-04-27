import Stripe from "stripe";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getGuestyOpenApiCredentials } from "./_shared/guestyEnv.js";
import { resolveSecurityDeposit } from "./_shared/securityDepositService.js";
const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const CONSENT_STORE_NAME = "consent-proofs";
const CONSENT_PDF_STORE_NAME = "consent-proof-pdfs";
const STRIPE_SESSION_STORE_NAME = "stripe-webhook-events";
const RESERVATIONS_COPY_EMAIL = "reservations@oneluxstay.com";
const STRIPE_SESSION_PROCESSING_STALE_MS = Number(
  process.env.STRIPE_SESSION_PROCESSING_STALE_MS || 120_000
);
const STRIPE_SESSION_PROCESSING_WAIT_MS = Number(
  process.env.STRIPE_SESSION_PROCESSING_WAIT_MS || 12_000
);
const ANTWERP_BE_TAX_PROFILE = "ANTWERP_BE";
const BELGIUM_VAT_RATE = 0.12;
const BELGIUM_CITY_TAX_PER_GUEST_PER_NIGHT = 2.97;
const DEFAULT_IGNORE_INACTIVE_CHILD_ALLOTMENT =
  String(process.env.GUESTY_IGNORE_INACTIVE_CHILD_ALLOTMENT || "true").toLowerCase() !== "false";
const DEFAULT_IGNORE_UNLISTED_CHILD_ALLOTMENT =
  String(process.env.GUESTY_IGNORE_UNLISTED_CHILD_ALLOTMENT || "false").toLowerCase() === "true";

const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const resolveFunctionPath = (event = {}) => {
  const explicitPath =
    (typeof event.path === "string" && event.path) ||
    (typeof event.rawPath === "string" && event.rawPath) ||
    "";
  let pathname = explicitPath;

  if (!pathname && typeof event.rawUrl === "string" && event.rawUrl) {
    try {
      pathname = new URL(event.rawUrl).pathname || "";
    } catch {
      pathname = event.rawUrl.split("?")[0];
    }
  }

  const clean = String(pathname || "").split("?")[0];
  const baseCandidates = [
    "/.netlify/functions/check-units",
    "/check-units",
  ];

  for (const base of baseCandidates) {
    if (clean === base) return "";
    if (clean.startsWith(`${base}/`)) {
      return clean.slice(base.length);
    }
  }

  return clean;
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const toStripeAmount = (amount, currency) => {
  const normalized = (currency || "USD").toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return Math.round(amount);
  return Math.round(amount * 100);
};

const toBooleanQueryString = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback ? "true" : "false";
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return "true";
  if (["0", "false", "no", "off"].includes(normalized)) return "false";
  return fallback ? "true" : "false";
};

const fromStripeAmount = (amount, currency) => {
  if (!Number.isFinite(amount)) return null;
  const normalized = (currency || "USD").toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return amount;
  return amount / 100;
};

const getBaseUrl = (event) => {
  const originHeader = event.headers?.origin;
  if (originHeader) return originHeader;
  const referer = event.headers?.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host;
  if (host) return `${proto}://${host}`;
  return "https://oneluxstay.com";
};

const sanitizeInternalPath = (value = "") => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("/")) return "";
  if (trimmed.startsWith("//")) return "";
  return trimmed;
};

const getRefererPath = (event = {}) => {
  const headers = event.headers || {};
  const referer =
    headers.referer ||
    headers.referrer ||
    headers.Referer ||
    headers.Referrer ||
    "";
  if (!referer) return "";
  try {
    const parsed = new URL(referer);
    return sanitizeInternalPath(`${parsed.pathname || "/"}${parsed.search || ""}`);
  } catch {
    return "";
  }
};

const withBookingSearchParams = (path = "/", { checkIn, checkOut, guests } = {}) => {
  const safePath = sanitizeInternalPath(path) || "/";
  let pathname = "/";
  let params = new URLSearchParams();

  try {
    const parsed = new URL(safePath, "https://oneluxstay.local");
    pathname = sanitizeInternalPath(parsed.pathname) || "/";
    params = new URLSearchParams(parsed.search || "");
  } catch {
    pathname = "/";
    params = new URLSearchParams();
  }

  if (checkIn) params.set("checkIn", String(checkIn));
  if (checkOut) params.set("checkOut", String(checkOut));
  const guestCount = Number(guests);
  if (Number.isFinite(guestCount) && guestCount > 0) {
    const normalizedGuests = String(Math.max(1, Math.round(guestCount)));
    params.set("guests", normalizedGuests);
    params.set("adults", normalizedGuests);
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
};

const formatCurrencyValue = (amount, currency = "USD") => {
  if (!Number.isFinite(Number(amount))) return "--";
  const numericAmount = Number(amount);
  const normalizedCurrency = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${normalizedCurrency} ${numericAmount.toFixed(2)}`;
  }
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toProofBaseUrl = (event = {}) => {
  const fromEnv =
    process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  if (fromEnv) return String(fromEnv).replace(/\/+$/, "");

  const headers = event?.headers || {};
  const host =
    headers["x-forwarded-host"] ||
    headers["X-Forwarded-Host"] ||
    headers.host ||
    headers.Host ||
    "";
  if (!host) return "";
  const proto =
    headers["x-forwarded-proto"] ||
    headers["X-Forwarded-Proto"] ||
    (String(host).includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
};

const toDataUrlBytes = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], "base64") };
};

const sanitizeText = (value, max = 180) => String(value || "").trim().slice(0, max);

const sanitizeImageDataUrl = (value, maxChars = 3_000_000) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/")) return "";
  return trimmed.slice(0, maxChars);
};

const normalizeProofImage = (value) => {
  if (!value) return { name: "", mime: "", dataUrl: "" };
  if (typeof value === "string") {
    return { name: "", mime: "", dataUrl: sanitizeImageDataUrl(value) };
  }
  return {
    name: sanitizeText(value.name || value.fileName || ""),
    mime: sanitizeText(value.mime || value.type || "", 80),
    dataUrl: sanitizeImageDataUrl(value.dataUrl || value.url || ""),
  };
};

const normalizeVerificationPayload = (verification = {}) => ({
  idFront: normalizeProofImage(
    verification?.idFront || {
      name: verification?.idFrontName,
      mime: verification?.idFrontMime,
      dataUrl: verification?.idFrontDataUrl,
    },
  ),
  idBack: normalizeProofImage(
    verification?.idBack || {
      name: verification?.idBackName,
      mime: verification?.idBackMime,
      dataUrl: verification?.idBackDataUrl,
    },
  ),
  idSelfie: normalizeProofImage(
    verification?.idSelfie || {
      name: verification?.idSelfieName,
      mime: verification?.idSelfieMime,
      dataUrl: verification?.idSelfieDataUrl,
    },
  ),
  cardPhoto: normalizeProofImage(
    verification?.cardPhoto || {
      name: verification?.cardPhotoName,
      mime: verification?.cardPhotoMime,
      dataUrl: verification?.cardPhotoDataUrl,
    },
  ),
  cardHolderSelfie: normalizeProofImage(
    verification?.cardHolderSelfie || {
      name: verification?.cardHolderSelfieName,
      mime: verification?.cardHolderSelfieMime,
      dataUrl: verification?.cardHolderSelfieDataUrl,
    },
  ),
});

const getVerificationEntries = (verification = {}) => [
  { label: "ID front", ...normalizeProofImage(verification?.idFront) },
  { label: "ID back", ...normalizeProofImage(verification?.idBack) },
  { label: "Selfie with ID", ...normalizeProofImage(verification?.idSelfie) },
  { label: "Card photo", ...normalizeProofImage(verification?.cardPhoto) },
  { label: "Selfie with card", ...normalizeProofImage(verification?.cardHolderSelfie) },
];

const scaleToFit = (width, height, maxWidth, maxHeight) => {
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const formatDateTime12h = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const buildConsentPdf = async ({
  confirmationId,
  reservationId,
  listingTitle,
  checkIn,
  checkOut,
  guests,
  amount,
  currency,
  guestName,
  guestEmail,
  consentText,
  consentAcceptedAt,
  consentSignerName,
  consentSignatureDataUrl,
  verification,
}) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 42;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = 56;
  const palette = {
    paper: rgb(0.973, 0.957, 0.929),
    panel: rgb(0.993, 0.987, 0.973),
    panelAlt: rgb(0.959, 0.933, 0.878),
    ink: rgb(0.108, 0.102, 0.11),
    text: rgb(0.204, 0.165, 0.133),
    muted: rgb(0.435, 0.369, 0.302),
    gold: rgb(0.757, 0.624, 0.369),
    border: rgb(0.835, 0.761, 0.639),
  };
  let page;
  let y = 0;

  const fitText = (value, textFont, size, maxWidth) => {
    const raw = String(value || "-").trim() || "-";
    if (textFont.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
    let trimmed = raw;
    while (trimmed.length > 1) {
      const next = `${trimmed}...`;
      if (textFont.widthOfTextAtSize(next, size) <= maxWidth) return next;
      trimmed = trimmed.slice(0, -1);
    }
    return "...";
  };

  const wrapText = (value, textFont, size, maxWidth) => {
    const words = String(value || "-").trim().split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textFont.widthOfTextAtSize(next, size) <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
  };

  const addPage = (subtitle = "CONSENT PROOF DOSSIER") => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: palette.paper });
    page.drawRectangle({ x: 0, y: pageHeight - 64, width: pageWidth, height: 64, color: palette.ink });
    page.drawRectangle({ x: 0, y: pageHeight - 68, width: pageWidth, height: 4, color: palette.gold });
    page.drawText("ONE LUX STAY", {
      x: marginX,
      y: pageHeight - 32,
      size: 16,
      font: fontBold,
      color: palette.panel,
    });
    page.drawText(subtitle, {
      x: marginX,
      y: pageHeight - 50,
      size: 9,
      font,
      color: palette.gold,
    });
    y = pageHeight - 92;
  };

  const ensureSpace = (requiredHeight) => {
    if (y - requiredHeight < bottomLimit) addPage("CONSENT PROOF DOSSIER (CONTINUED)");
  };

  const drawSection = (title) => {
    ensureSpace(28);
    page.drawText(String(title || "").toUpperCase(), {
      x: marginX,
      y,
      size: 10,
      font: fontBold,
      color: palette.muted,
    });
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: marginX + contentWidth, y: y - 4 },
      thickness: 1,
      color: palette.gold,
    });
    y -= 22;
  };

  const drawDetailGrid = (items = []) => {
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push([items[i], items[i + 1] || null]);
    }
    const rowHeight = 40;
    const cardHeight = 18 + rows.length * rowHeight + 8;
    ensureSpace(cardHeight + 8);

    const cardTop = y;
    const cardBottom = y - cardHeight;
    const midX = marginX + contentWidth / 2;
    const leftX = marginX + 14;
    const rightX = midX + 14;
    const valueWidth = contentWidth / 2 - 28;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawLine({
      start: { x: midX, y: cardBottom + 8 },
      end: { x: midX, y: cardTop - 8 },
      thickness: 1,
      color: palette.border,
    });

    rows.forEach((row, index) => {
      const rowTop = cardTop - 14 - index * rowHeight;
      if (index > 0) {
        page.drawLine({
          start: { x: marginX + 10, y: rowTop + 8 },
          end: { x: marginX + contentWidth - 10, y: rowTop + 8 },
          thickness: 1,
          color: palette.border,
        });
      }
      const [left, right] = row;
      if (left) {
        page.drawText((left.label || "").toUpperCase(), {
          x: leftX,
          y: rowTop,
          size: 7,
          font: fontBold,
          color: palette.gold,
        });
        page.drawText(fitText(left.value, font, 11, valueWidth), {
          x: leftX,
          y: rowTop - 14,
          size: 11,
          font,
          color: palette.text,
        });
      }
      if (right) {
        page.drawText((right.label || "").toUpperCase(), {
          x: rightX,
          y: rowTop,
          size: 7,
          font: fontBold,
          color: palette.gold,
        });
        page.drawText(fitText(right.value, font, 11, valueWidth), {
          x: rightX,
          y: rowTop - 14,
          size: 11,
          font,
          color: palette.text,
        });
      }
    });

    y = cardBottom - 12;
  };

  const drawConsentText = (text) => {
    const lines = wrapText(text, font, 10.5, contentWidth - 34);
    const lineHeight = 14;
    const cardHeight = 26 + lines.length * lineHeight + 12;
    ensureSpace(cardHeight + 8);
    const cardTop = y;
    const cardBottom = y - cardHeight;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panelAlt,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawRectangle({
      x: marginX + 10,
      y: cardBottom + 10,
      width: 3,
      height: cardHeight - 20,
      color: palette.gold,
    });

    let textY = cardTop - 20;
    for (const line of lines) {
      page.drawText(line, { x: marginX + 20, y: textY, size: 10.5, font, color: palette.text });
      textY -= lineHeight;
    }
    y = cardBottom - 14;
  };

  const drawSignature = async () => {
    ensureSpace(178);
    const cardTop = y;
    const cardHeight = 166;
    const cardBottom = y - cardHeight;
    const signatureLabelY = cardTop - 22;
    const signatureBoxX = marginX + 16;
    const signatureBoxY = cardBottom + 22;
    const signatureBoxWidth = 256;
    const signatureBoxHeight = 92;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawText("SIGNATURE RECORD", {
      x: marginX + 16,
      y: signatureLabelY,
      size: 9,
      font: fontBold,
      color: palette.gold,
    });
    page.drawRectangle({
      x: signatureBoxX,
      y: signatureBoxY,
      width: signatureBoxWidth,
      height: signatureBoxHeight,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.panelAlt,
    });

    const sig = toDataUrlBytes(consentSignatureDataUrl);
    if (sig) {
      try {
        const embedded = sig.mime.includes("png")
          ? await pdfDoc.embedPng(sig.bytes)
          : await pdfDoc.embedJpg(sig.bytes);
        const fitted = scaleToFit(embedded.width, embedded.height, signatureBoxWidth - 16, signatureBoxHeight - 16);
        page.drawImage(embedded, {
          x: signatureBoxX + 8 + Math.max(0, (signatureBoxWidth - 16 - fitted.width) / 2),
          y: signatureBoxY + 8 + Math.max(0, (signatureBoxHeight - 16 - fitted.height) / 2),
          width: fitted.width,
          height: fitted.height,
        });
      } catch {
        page.drawText("Signature image unavailable", {
          x: signatureBoxX + 12,
          y: signatureBoxY + signatureBoxHeight / 2 - 4,
          size: 10,
          font,
          color: palette.muted,
        });
      }
    } else {
      page.drawText("No signature image captured", {
        x: signatureBoxX + 12,
        y: signatureBoxY + signatureBoxHeight / 2 - 4,
        size: 10,
        font,
        color: palette.muted,
      });
    }

    const infoX = signatureBoxX + signatureBoxWidth + 18;
    const infoWidth = contentWidth - (infoX - marginX) - 16;
    page.drawText("SIGNED BY", { x: infoX, y: signatureLabelY - 8, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(consentSignerName || "-", font, 11, infoWidth), {
      x: infoX,
      y: signatureLabelY - 24,
      size: 11,
      font,
      color: palette.text,
    });
    page.drawText("CONSENT ACCEPTED", { x: infoX, y: signatureLabelY - 52, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(formatDateTime12h(consentAcceptedAt), font, 11, infoWidth), {
      x: infoX,
      y: signatureLabelY - 68,
      size: 11,
      font,
      color: palette.text,
    });

    y = cardBottom - 14;
  };

  const drawVerification = async (entry) => {
    const cardHeight = 196;
    ensureSpace(cardHeight + 8);
    const cardTop = y;
    const cardBottom = y - cardHeight;
    const boxX = marginX + 14;
    const boxWidth = contentWidth - 28;
    const previewX = boxX;
    const previewWidth = boxWidth;
    const previewHeight = 136;
    const previewY = cardBottom + 18;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });

    const heading = entry?.name
      ? `${entry.label}: ${sanitizeText(entry.name, 96)}`
      : `${entry.label}:`;
    page.drawText(fitText(heading, fontBold, 10, boxWidth), {
      x: boxX,
      y: cardTop - 22,
      size: 10,
      font: fontBold,
      color: palette.text,
    });

    page.drawRectangle({
      x: previewX,
      y: previewY,
      width: previewWidth,
      height: previewHeight,
      color: palette.panelAlt,
      borderColor: palette.border,
      borderWidth: 1,
    });

    const imageData = toDataUrlBytes(entry?.dataUrl);
    if (imageData) {
      try {
        const embeddedImage = imageData.mime.includes("png")
          ? await pdfDoc.embedPng(imageData.bytes)
          : await pdfDoc.embedJpg(imageData.bytes);
        const fitted = scaleToFit(embeddedImage.width, embeddedImage.height, previewWidth - 16, previewHeight - 16);
        page.drawImage(embeddedImage, {
          x: previewX + 8 + Math.max(0, (previewWidth - 16 - fitted.width) / 2),
          y: previewY + 8 + Math.max(0, (previewHeight - 16 - fitted.height) / 2),
          width: fitted.width,
          height: fitted.height,
        });
      } catch {
        page.drawText("Preview unavailable for this uploaded file.", {
          x: previewX + 12,
          y: previewY + previewHeight / 2 - 4,
          size: 10,
          font,
          color: palette.muted,
        });
      }
    } else {
      page.drawText("No preview image captured.", {
        x: previewX + 12,
        y: previewY + previewHeight / 2 - 4,
        size: 10,
        font,
        color: palette.muted,
      });
    }

    y = cardBottom - 12;
  };

  addPage();

  const detailItems = [
    { label: "Generated at", value: formatDateTime12h(new Date()) },
    { label: "Confirmation ID", value: confirmationId || "-" },
    { label: "Reservation ID", value: reservationId || "-" },
    { label: "Listing", value: listingTitle || "-" },
    { label: "Guest", value: guestName || "-" },
    { label: "Guest email", value: guestEmail || "-" },
    { label: "Check-in", value: checkIn || "-" },
    { label: "Check-out", value: checkOut || "-" },
    { label: "Guests", value: Number.isFinite(Number(guests)) ? String(Number(guests)) : "-" },
    { label: "Total charged", value: formatCurrencyValue(amount, currency) },
    { label: "Consent accepted", value: formatDateTime12h(consentAcceptedAt) },
    { label: "Signed by", value: consentSignerName || "-" },
  ];
  drawSection("Reservation and Guest Details");
  drawDetailGrid(detailItems);

  drawSection("Consent Statement");
  drawConsentText(consentText || "-");

  drawSection("Guest Authorization");
  await drawSignature();

  const verificationEntries = getVerificationEntries(verification).filter(
    (item) => item?.dataUrl || item?.name,
  );
  if (verificationEntries.length) {
    drawSection("Verification Uploads");
    for (const entry of verificationEntries) {
      await drawVerification(entry);
    }
  }

  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({
      start: { x: marginX, y: 38 },
      end: { x: pageWidth - marginX, y: 38 },
      thickness: 1,
      color: palette.border,
    });
    pdfPage.drawText("OneLuxStay Confidential Consent Record", {
      x: marginX,
      y: 24,
      size: 8,
      font,
      color: palette.muted,
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const pageTextWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - marginX - pageTextWidth,
      y: 24,
      size: 8,
      font,
      color: palette.muted,
    });
  });

  return pdfDoc.save();
};

const sendReservationEmail = async ({ to, subject, html, attachments = [] }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!apiKey || !from || !recipients.length) {
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
      to: recipients,
      subject,
      html,
      ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.message || "Unable to send reservation email.");
  }
  return payload;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const uniqueEmails = (values = []) =>
  Array.from(
    new Set(
      values
        .map((value) => normalizeEmail(value))
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
    ),
  );

const getSessionGuestEmail = (session = {}) =>
  uniqueEmails([
    session?.metadata?.guestEmail,
    session?.metadata?.guest_email,
    session?.metadata?.email,
    session?.customer_email,
    session?.customer_details?.email,
  ])[0] || "";

const parseStripeSecretKeys = () => {
  const sources = [
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_SECRET_KEYS,
    process.env.STRIPE_SECRET_KEY_NEXT,
  ];
  return Array.from(
    new Set(
      sources
        .flatMap((value) => String(value || "").split(/[\s,;]+/))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
};

const stripeClients = new Map();
const getStripeClient = (keyOverride = "") => {
  const key = String(keyOverride || process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClients.has(key)) {
    stripeClients.set(key, new Stripe(key, { apiVersion: "2023-10-16" }));
  }
  return stripeClients.get(key);
};

const fetchWithTimeout = async (url, options = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retrieveStripeCheckoutSession = async (stripe, sessionId, options = {}) => {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await stripe.checkout.sessions.retrieve(sessionId, options);
    } catch (err) {
      lastError = err;
      const message = String(err?.message || "").toLowerCase();
      const isNetworkError =
        message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("socket");
      if (!isNetworkError || attempt >= maxAttempts) {
        throw err;
      }
      await sleep(200 * attempt);
    }
  }

  throw lastError || new Error("Unable to retrieve Stripe checkout session.");
};

const getBlobStore = async (storeName = TOKEN_STORE_NAME) => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env.NETLIFY_SITE_ID;
    const apiToken = process.env.NETLIFY_API_TOKEN;
    return siteID && apiToken
      ? getStore(storeName, { siteID, token: apiToken })
      : getStore(storeName);
  } catch {
    return null;
  }
};

const writeConsentProof = async (sessionId, payload) => {
  if (!sessionId || !payload) return false;
  const store = await getBlobStore(CONSENT_STORE_NAME);
  if (!store) return false;
  await store.setJSON(sessionId, payload);
  return true;
};

const readConsentProof = async (sessionId) => {
  if (!sessionId) return null;
  const store = await getBlobStore(CONSENT_STORE_NAME);
  if (!store) return null;
  return store.get(sessionId, { type: "json" });
};

const writeConsentPdf = async (token, pdfBytes, metadata = {}) => {
  if (!token || !pdfBytes) return false;
  const store = await getBlobStore(CONSENT_PDF_STORE_NAME);
  if (!store) return false;
  await store.set(token, Buffer.from(pdfBytes), { metadata });
  return true;
};

const stripeSessionStoreKey = (sessionId) => `session:${String(sessionId || "")}`;

const readStripeSessionRecord = async (sessionId) => {
  if (!sessionId) return null;
  const store = await getBlobStore(STRIPE_SESSION_STORE_NAME);
  if (!store) return null;
  return store.get(stripeSessionStoreKey(sessionId), { type: "json" });
};

const writeStripeSessionRecord = async (sessionId, payload) => {
  if (!sessionId || !payload) return false;
  const store = await getBlobStore(STRIPE_SESSION_STORE_NAME);
  if (!store) return false;
  await store.setJSON(stripeSessionStoreKey(sessionId), payload);
  return true;
};

const waitForStripeSessionReservation = async (
  sessionId,
  { timeoutMs = STRIPE_SESSION_PROCESSING_WAIT_MS, pollMs = 500 } = {}
) => {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let latest = null;
  while (Date.now() <= deadline) {
    latest = await readStripeSessionRecord(sessionId);
    if (latest?.reservationId || latest?.processedAt) {
      return latest;
    }
    await sleep(pollMs);
  }
  return latest || (await readStripeSessionRecord(sessionId));
};

const claimStripeSessionProcessing = async (sessionId, source) => {
  if (!sessionId) return { claimed: false, record: null, reason: "missing-session-id" };

  const current = await readStripeSessionRecord(sessionId);
  if (current?.reservationId || current?.processedAt) {
    return { claimed: false, record: current, reason: "already-processed" };
  }

  const processingAt = Number(current?.processingAt || 0);
  if (processingAt && Date.now() - processingAt < STRIPE_SESSION_PROCESSING_STALE_MS) {
    const waited = await waitForStripeSessionReservation(sessionId);
    if (waited?.reservationId || waited?.processedAt) {
      return { claimed: false, record: waited, reason: "processed-by-other" };
    }
    const refreshed = await readStripeSessionRecord(sessionId);
    const refreshedProcessingAt = Number(refreshed?.processingAt || 0);
    if (
      refreshed?.processingToken &&
      refreshedProcessingAt &&
      Date.now() - refreshedProcessingAt < STRIPE_SESSION_PROCESSING_STALE_MS
    ) {
      return { claimed: false, record: refreshed, reason: "processing-by-other" };
    }
  }

  const token = `${String(source || "checkout").slice(0, 20)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const claimedAt = Date.now();
  const claimRecord = {
    ...(current || {}),
    sessionId,
    processingToken: token,
    processingSource: source || "check-units",
    processingAt: claimedAt,
    processingUpdatedAt: claimedAt,
  };

  const wrote = await writeStripeSessionRecord(sessionId, claimRecord);
  if (!wrote) {
    return { claimed: true, token, record: claimRecord, reason: "store-unavailable" };
  }

  await sleep(150 + Math.floor(Math.random() * 150));
  const verify = await readStripeSessionRecord(sessionId);
  if (verify?.processingToken === token) {
    return { claimed: true, token, record: verify };
  }

  if (verify?.reservationId || verify?.processedAt) {
    return { claimed: false, record: verify, reason: "lost-race" };
  }

  const waited = await waitForStripeSessionReservation(sessionId);
  if (waited?.reservationId || waited?.processedAt) {
    return { claimed: false, record: waited, reason: "processed-after-race" };
  }

  return { claimed: false, record: verify || waited || current || null, reason: "claim-conflict" };
};

const requestGuestyToken = async () => {
  const { clientId, clientSecret } = getGuestyOpenApiCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty API credentials");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(`${OPEN_API_HOST}/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

const getGuestyToken = async () => {
  const now = Date.now();
  if (globalThis.GUESTY_TOKEN && globalThis.GUESTY_TOKEN_EXPIRES > now + 60_000) {
    return { token: globalThis.GUESTY_TOKEN, source: "memory" };
  }

  const store = await getBlobStore();
  if (store) {
    let cached = await store.get(TOKEN_KEY, { type: "json" });
    if (!cached) {
      const raw = await store.get(TOKEN_KEY, { type: "text" });
      cached = raw ? JSON.parse(raw) : null;
    }
    if (cached && cached.token && cached.expiresAt > now + 60_000) {
      globalThis.GUESTY_TOKEN = cached.token;
      globalThis.GUESTY_TOKEN_EXPIRES = cached.expiresAt;
      return { token: cached.token, source: "blob" };
    }
  }

  const data = await requestGuestyToken();
  const tokenData = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  if (store) {
    await store.setJSON(TOKEN_KEY, tokenData);
  }
  globalThis.GUESTY_TOKEN = tokenData.token;
  globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;
  return { token: tokenData.token, source: "fresh" };
};

const createGuestyReservation = async (payload) => {
  const { token } = await getGuestyToken();
  const postOnce = async (body) => {
    const response = await fetchWithTimeout(`${OPEN_API_V1}/reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(text || `Guesty reservation create failed (${response.status})`);
      error.statusCode = response.status;
      error.body = text;
      throw error;
    }

    return text ? JSON.parse(text) : {};
  };

  try {
    return await postOnce(payload);
  } catch (error) {
    const msg = String(error?.body || error?.message || "");
    const isSchemaReject =
      Number(error?.statusCode) === 400 &&
      (msg.includes("guestsCount") || msg.includes("numberOfGuests") || msg.includes("additionalProperties"));
    if (!isSchemaReject) throw error;

    // Some Guesty accounts/environments reject these optional fields. Retry without them.
    const fallback = { ...(payload || {}) };
    delete fallback.guestsCount;
    delete fallback.numberOfGuests;
    return await postOnce(fallback);
  }
};

const buildGuestyReservationPayload = ({
  listingId,
  checkIn,
  checkOut,
  guests,
  guest,
  currency,
  amount,
  breakdown,
}) => {
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
  const firstName = guest?.firstName || nameParts[0] || "Guest";
  const lastName = guest?.lastName || nameParts.slice(1).join(" ") || "Guest";

  const payload = {
    listingId: String(listingId),
    checkInDateLocalized: String(checkIn),
    checkOutDateLocalized: String(checkOut),
    status: "confirmed",
    guest: {
      firstName,
      lastName,
      email: guest?.email || "",
      phone: guest?.phone || "",
    },
  };

  const accommodation = Number(breakdown?.accommodation);
  const cleaning = Number(breakdown?.cleaning);
  const fees = Number(breakdown?.fees);
  const taxes = Number(breakdown?.taxes);
  const securityDeposit = Number(breakdown?.securityDeposit);
  const vat = Number(breakdown?.vat);
  const cityTax = Number(breakdown?.cityTax);
  const discountAmountRaw = Number(breakdown?.discountAmount ?? breakdown?.discount ?? 0);
  const promoDiscountAmountRaw = Number(breakdown?.promoDiscountAmount ?? 0);
  const promoCode = String(breakdown?.promoCode || "").trim();
  const taxProfile = String(breakdown?.taxProfile || "").trim().toUpperCase();
  const effectiveTotal = Number.isFinite(Number(amount)) ? Number(amount) : null;
  const money = {};
  const invoiceItems = [];
  const roundMoney = (value) =>
    Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const discountAmount = Number.isFinite(discountAmountRaw) && discountAmountRaw > 0 ? roundMoney(discountAmountRaw) : 0;
  const promoDiscountAmount =
    Number.isFinite(promoDiscountAmountRaw) && promoDiscountAmountRaw > 0 ? roundMoney(promoDiscountAmountRaw) : 0;
  const totalDiscount = (discountAmount || 0) + (promoDiscountAmount || 0);
  const cleaningValue = Number.isFinite(cleaning) ? roundMoney(cleaning) : null;
  const taxesValue = Number.isFinite(taxes) ? roundMoney(taxes) : null;
  const feesValue = Number.isFinite(fees) ? roundMoney(fees) : null;
  const securityDepositValue = Number.isFinite(securityDeposit) ? roundMoney(securityDeposit) : null;
  const miscFeesValue =
    feesValue !== null
      ? roundMoney((feesValue || 0) - (securityDepositValue || 0))
      : null;
  const vatValue = Number.isFinite(vat) ? roundMoney(vat) : null;
  const cityTaxValue = Number.isFinite(cityTax) ? roundMoney(cityTax) : null;
  const checkInDate = new Date(String(checkIn || ""));
  const checkOutDate = new Date(String(checkOut || ""));
  const parsedGuests = Number(guests);
  const normalizedGuests =
    Number.isFinite(parsedGuests) && parsedGuests > 0 ? Math.round(parsedGuests) : 1;
  payload.guestsCount = normalizedGuests;
  payload.numberOfGuests = { numberOfAdults: normalizedGuests };
  const derivedNightsMs = checkOutDate.getTime() - checkInDate.getTime();
  const normalizedNights =
    Number.isFinite(derivedNightsMs) && derivedNightsMs > 0
      ? Math.round(derivedNightsMs / (1000 * 60 * 60 * 24))
      : 1;
  const derivedVatValue =
    vatValue !== null
      ? vatValue
      : Number.isFinite(accommodation) && accommodation > 0
        ? roundMoney(accommodation * BELGIUM_VAT_RATE)
        : null;
  const derivedCityTaxValue =
    cityTaxValue !== null
      ? cityTaxValue
      : roundMoney(BELGIUM_CITY_TAX_PER_GUEST_PER_NIGHT * normalizedGuests * normalizedNights);
  const shouldSplitBelgiumTaxes =
    taxProfile === ANTWERP_BE_TAX_PROFILE || vatValue !== null || cityTaxValue !== null;

  let fareAccommodation = Number.isFinite(accommodation) ? roundMoney(accommodation) : null;
  if (fareAccommodation === null && Number.isFinite(effectiveTotal) && effectiveTotal >= 0) {
    const nonAccommodation =
      (cleaningValue && cleaningValue > 0 ? cleaningValue : 0) +
      (taxesValue && taxesValue > 0 ? taxesValue : 0) +
      (securityDepositValue && securityDepositValue > 0 ? securityDepositValue : 0) +
      (miscFeesValue && miscFeesValue > 0 ? miscFeesValue : 0);
    fareAccommodation = roundMoney(Math.max(effectiveTotal - nonAccommodation, 0));
  }
  if (fareAccommodation !== null) {
    money.fareAccommodation = fareAccommodation;
  } else if (Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    money.fareAccommodation = roundMoney(effectiveTotal);
  }

  if (discountAmount > 0) {
    invoiceItems.push({ title: "Discount", amount: roundMoney(-discountAmount), normalType: "DISC" });
  }
  if (promoDiscountAmount > 0) {
    const label = promoCode ? `Promo Discount (${promoCode})` : "Promo Discount";
    invoiceItems.push({ title: label, amount: roundMoney(-promoDiscountAmount), normalType: "DISC" });
  }

  if (cleaningValue !== null && cleaningValue > 0) {
    money.fareCleaning = cleaningValue;
  }
  if (taxesValue !== null && taxesValue > 0) {
    if (shouldSplitBelgiumTaxes) {
      let taxesRemaining = taxesValue;
      const desiredCityTax = derivedCityTaxValue !== null ? Math.max(derivedCityTaxValue, 0) : 0;
      const desiredVat = derivedVatValue !== null ? Math.max(derivedVatValue, 0) : 0;
      const splitCityTax = roundMoney(Math.min(desiredCityTax, taxesRemaining)) || 0;
      taxesRemaining = roundMoney(taxesRemaining - splitCityTax) || 0;
      const splitVat = roundMoney(Math.min(desiredVat, taxesRemaining)) || 0;
      taxesRemaining = roundMoney(taxesRemaining - splitVat) || 0;
      if (splitCityTax > 0) {
        invoiceItems.push({ title: "City Tax", amount: splitCityTax, normalType: "CT" });
      }
      if (splitVat > 0) {
        invoiceItems.push({ title: "VAT", amount: splitVat, normalType: "VAT" });
      }
      const taxRemainder = roundMoney(taxesRemaining);
      if (taxRemainder !== null && taxRemainder > 0) {
        invoiceItems.push({ title: "Occupancy Tax", amount: taxRemainder, normalType: "OCT" });
      }
    } else {
      invoiceItems.push({ title: "Occupancy Tax", amount: taxesValue, normalType: "OCT" });
    }
  }
  if (miscFeesValue !== null && miscFeesValue > 0) {
    invoiceItems.push({ title: "Fees", amount: miscFeesValue, normalType: "OTHER" });
  }
  if (securityDepositValue !== null && securityDepositValue > 0) {
    invoiceItems.push({
      title: "Security Deposit",
      amount: securityDepositValue,
      normalType: "OTHER",
    });
  }

  if (
    Number.isFinite(effectiveTotal) &&
    Number.isFinite(money.fareAccommodation)
  ) {
    const runningTotal =
      (money.fareAccommodation || 0) +
      (Number.isFinite(money.fareCleaning) ? money.fareCleaning : 0) +
      invoiceItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
        0
      );
    const diff = roundMoney(effectiveTotal - runningTotal);
    if (diff !== null && Math.abs(diff) >= 0.01) {
      money.fareAccommodation = roundMoney(Math.max((money.fareAccommodation || 0) + diff, 0));
    }
  }

  if (invoiceItems.length) {
    money.invoiceItems = invoiceItems;
  }

  if (currency) {
    money.currency = String(currency).toUpperCase();
  }
  if (Object.keys(money).length) {
    payload.money = money;
  }

  return payload;
};

const postReservationPayment = async (reservationId, paymentMethod, amount, note) => {
  const { token } = await getGuestyToken();
  const response = await fetchWithTimeout(
    `${OPEN_API_V1}/reservations/${reservationId}/payments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        paymentMethod,
        amount,
        note,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

const createReservationPayment = async (reservationId, session) => {
  if (!reservationId) return null;
  const metadata = session?.metadata || {};
  const stripeAmount =
    Number.isFinite(session?.amount_total)
      ? fromStripeAmount(session.amount_total, session?.currency)
      : null;
  const metaTotal =
    Number.isFinite(Number(metadata.bd_total)) ? Number(metadata.bd_total) : null;
  const metaAmount =
    Number.isFinite(Number(metadata.amount)) ? Number(metadata.amount) : null;
  const rawAmount = stripeAmount ?? metaTotal ?? metaAmount;
  const amount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const note = `Paid via Stripe checkout session ${session?.id || ""}`.trim();
  const preferredMethod = (process.env.GUESTY_PAYMENT_METHOD || "").trim().toUpperCase();
  const methods = [
    ...(preferredMethod ? [preferredMethod] : []),
    "OTHER",
    "BANK_TRANSFER",
    "CASH",
  ].filter((value, index, array) => array.indexOf(value) === index);

  const errors = [];
  for (const method of methods) {
    try {
      return await postReservationPayment(reservationId, { method }, amount, note);
    } catch (err) {
      errors.push(`${method}: ${err.message}`);
    }
  }

  throw new Error(`Failed to record payment in Guesty. ${errors.join(" | ")}`);
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const roundMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
};

const normalizeCheckoutBreakdown = (breakdown = {}) => {
  if (!breakdown || typeof breakdown !== "object") return null;
  const safe = { ...breakdown };
  const fields = [
    "accommodation",
    "cleaning",
    "fees",
    "taxes",
    "vat",
    "cityTax",
    "discountAmount",
    "discountRate",
    "subtotal",
    "total",
    "securityDeposit",
    "promoDiscountAmount",
    "promoDiscountRate",
  ];
  fields.forEach((key) => {
    const numeric = firstNumber(safe[key]);
    if (numeric !== null) safe[key] = roundMoney(numeric);
  });
  return safe;
};

const applySecurityDepositToAmount = ({
  numericAmount,
  breakdown,
  securityDepositAmount,
  securityDepositCurrency,
} = {}) => {
  const deposit = roundMoney(securityDepositAmount) || 0;
  const normalizedBreakdown = normalizeCheckoutBreakdown(breakdown);
  const existingDeposit =
    normalizedBreakdown && Number.isFinite(Number(normalizedBreakdown.securityDeposit))
      ? roundMoney(normalizedBreakdown.securityDeposit) || 0
      : 0;
  const adjustedAmount = roundMoney((Number(numericAmount) || 0) - existingDeposit + deposit) || 0;

  if (!normalizedBreakdown) {
    return {
      numericAmount: adjustedAmount,
      breakdown: null,
      securityDeposit: deposit,
      securityDepositCurrency: securityDepositCurrency || null,
    };
  }

  return {
    numericAmount: adjustedAmount,
    breakdown: {
      ...normalizedBreakdown,
      securityDeposit: deposit,
      securityDepositCurrency: securityDepositCurrency || normalizedBreakdown.securityDepositCurrency || null,
      subtotal: adjustedAmount,
      total: adjustedAmount,
    },
    securityDeposit: deposit,
    securityDepositCurrency: securityDepositCurrency || normalizedBreakdown.securityDepositCurrency || null,
  };
};

const parseIntegerQueryParam = (value, { key, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 }) => {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${key} query parameter.`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`Invalid ${key} query parameter. Expected ${min}-${max}.`);
  }
  return parsed;
};

const parseBooleanQueryParam = (value, { key, fallback = false }) => {
  if (value == null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid ${key} query parameter. Use true or false.`);
};

const parseJsonArrayQueryParam = (rawValue, { key }) => {
  if (rawValue == null || String(rawValue).trim() === "") return undefined;
  const raw = String(rawValue).trim();
  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // ignore decode failures and fall back to the raw input
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // keep trying candidates
    }
  }

  throw new Error(`Invalid ${key} query parameter. Expected a JSON array.`);
};

const normalizeReservationRows = (payload) => {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.reservations)) return payload.reservations;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const getReservationTotal = (payload) =>
  firstNumber(
    payload?.count,
    payload?.total,
    payload?.totalCount,
    payload?.pagination?.total,
    payload?.meta?.total,
  );

const enumerateDates = (start, end) => {
  const dates = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const normalizeCalendarItems = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.data?.days)) {
    const grouped = {};
    payload.data.days.forEach((day) => {
      const listingId =
        day?.listingId ||
        day?.listing?._id ||
        day?.listing?.id ||
        day?.listing?.listingId;
      if (!listingId) return;
      if (!grouped[listingId]) grouped[listingId] = [];
      grouped[listingId].push(day);
    });
    const entries = Object.entries(grouped).map(([listingId, days]) => ({ listingId, days }));
    if (entries.length) return entries;
  }
  if (Array.isArray(payload?.days)) {
    const grouped = {};
    payload.days.forEach((day) => {
      const listingId =
        day?.listingId ||
        day?.listing?._id ||
        day?.listing?.id ||
        day?.listing?.listingId;
      if (!listingId) return;
      if (!grouped[listingId]) grouped[listingId] = [];
      grouped[listingId].push(day);
    });
    const entries = Object.entries(grouped).map(([listingId, days]) => ({ listingId, days }));
    if (entries.length) return entries;
  }
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.listings)) return payload.listings;
  if (Array.isArray(payload?.calendars)) return payload.calendars;
  if (Array.isArray(payload)) return payload;
  if (payload?.calendars && typeof payload.calendars === "object") {
    return Object.values(payload.calendars);
  }
  if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return Object.values(payload.data);
  }
  return [];
};

const isDayAvailable = (day) => {
  if (!day) return false;
  if (typeof day.allotment === "number") return day.allotment > 0;
  if (typeof day.available === "boolean") return day.available;
  if (typeof day.isAvailable === "boolean") return day.isAvailable;
  if (typeof day.status === "string") return day.status === "available";
  return false;
};

const normalizeCalendarDay = (day, fallbackCurrency) => {
  const date =
    day?.date ||
    day?.dateLocalized ||
    day?.day ||
    (typeof day?.startDate === "string" ? day.startDate.split("T")[0] : null);
  if (!date) return null;

  const price = firstNumber(
    day?.price,
    day?.nightlyPrice,
    day?.nightlyRate,
    day?.basePrice,
    day?.basePricePerNight,
    day?.price?.amount,
    day?.price?.value,
    day?.money?.amount,
    day?.money?.money?.amount
  );

  const currency =
    day?.currency ||
    day?.price?.currency ||
    day?.money?.currency ||
    day?.money?.money?.currency ||
    fallbackCurrency ||
    "USD";

  const minNights = firstNumber(
    day?.minNights,
    day?.minimumStay,
    day?.minStay,
    day?.minStayLength,
    day?.restrictions?.minNights,
    day?.restrictions?.minStay
  );

  const maxNights = firstNumber(
    day?.maxNights,
    day?.maximumStay,
    day?.maxStay,
    day?.maxStayLength,
    day?.restrictions?.maxNights,
    day?.restrictions?.maxStay
  );

  return {
    date,
    price,
    currency,
    restrictions: {
      minNights,
      maxNights,
      closedToArrival: Boolean(day?.closedToArrival ?? day?.cta ?? day?.restrictions?.cta),
      closedToDeparture: Boolean(day?.closedToDeparture ?? day?.ctd ?? day?.restrictions?.ctd),
    },
    status: day?.status,
    allotment: typeof day?.allotment === "number" ? day.allotment : null,
  };
};

const handleAvailabilityBulk = async (event, token, tokenSource) => {
  const {
    ids = "",
    startDate = "",
    endDate = "",
    ignoreInactiveChildAllotment: ignoreInactiveParam,
    ignoreUnlistedChildAllotment: ignoreUnlistedParam,
  } = event.queryStringParameters || {};
  if (!ids || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing ids, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds: ids,
    startDate,
    endDate,
    includeAllotment: "true",
    ignoreInactiveChildAllotment: toBooleanQueryString(
      ignoreInactiveParam,
      DEFAULT_IGNORE_INACTIVE_CHILD_ALLOTMENT
    ),
    ignoreUnlistedChildAllotment: toBooleanQueryString(
      ignoreUnlistedParam,
      DEFAULT_IGNORE_UNLISTED_CHILD_ALLOTMENT
    ),
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Availability bulk failed", error: await res.text() });
  }

  const payload = await res.json();
  const calendars = normalizeCalendarItems(payload);
  const dateList = enumerateDates(new Date(startDate), new Date(endDate));

  const results = calendars.map((entry) => {
    const listingId = entry?.listingId || entry?.id || entry?._id;
    const days = entry?.days || entry?.calendar || entry?.data || entry?.availability || [];
    const dayMap = new Map(
      Array.isArray(days)
        ? days.map((day) => [day?.date || day?.dateLocalized || day?.day, day])
        : []
    );
    const available = dateList.every((date) => isDayAvailable(dayMap.get(date)));
    return { id: listingId, available };
  });

  return jsonResponse(200, { results, tokenSource });
};

const handleAvailabilityQuery = async (event, token, tokenSource) => {
  const { ids = "", checkIn = "", checkOut = "", minOccupancy = "1" } =
    event.queryStringParameters || {};
  if (!ids || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing ids, checkIn, or checkOut" });
  }

  const available = {
    checkIn,
    checkOut,
    minOccupancy: Number(minOccupancy) || 1,
  };

  const qs = new URLSearchParams({
    ids,
    available: JSON.stringify(available),
  });

  const res = await fetchWithTimeout(`${OPEN_API_V1}/listings?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Availability query failed", error: await res.text() });
  }

  const payload = await res.json();
  const results = Array.isArray(payload?.results)
    ? payload.results.map((item) => ({
        id: item?._id || item?.id,
        available: true,
      }))
    : [];

  return jsonResponse(200, { results, tokenSource });
};

const handleCalendarMulti = async (event, token, tokenSource) => {
  const {
    listingIds = "",
    startDate = "",
    endDate = "",
    includeAllotment = "false",
    ignoreInactiveChildAllotment: ignoreInactiveParam,
    ignoreUnlistedChildAllotment: ignoreUnlistedParam,
  } = event.queryStringParameters || {};

  if (!listingIds || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing listingIds, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds,
    startDate,
    endDate,
    includeAllotment,
    ignoreInactiveChildAllotment: toBooleanQueryString(
      ignoreInactiveParam,
      DEFAULT_IGNORE_INACTIVE_CHILD_ALLOTMENT
    ),
    ignoreUnlistedChildAllotment: toBooleanQueryString(
      ignoreUnlistedParam,
      DEFAULT_IGNORE_UNLISTED_CHILD_ALLOTMENT
    ),
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Calendar multi failed", error: await res.text() });
  }

  const payload = await res.json();
  const calendars = normalizeCalendarItems(payload);
  const normalizedCalendars = {};
  const normalizedList =
    calendars.length
      ? calendars
      : payload?.listingId && Array.isArray(payload?.days)
        ? [payload]
        : [];

  normalizedList.forEach((entry) => {
    const listingId = entry?.listingId || entry?.id || entry?._id;
    if (!listingId) return;
    const daysRaw = entry?.days || entry?.calendar || entry?.data || entry?.availability || [];
    const currency = entry?.currency;
    const days = Array.isArray(daysRaw)
      ? daysRaw.map((day) => normalizeCalendarDay(day, currency)).filter(Boolean)
      : [];
    normalizedCalendars[listingId] = days;
  });

  return jsonResponse(200, { ...payload, normalizedCalendars, tokenSource });
};

const handleCalendarPrices = async (event, token, tokenSource, listingId) => {
  const {
    startDate,
    endDate,
    months = "1",
    ignoreInactiveChildAllotment: ignoreInactiveParam,
    ignoreUnlistedChildAllotment: ignoreUnlistedParam,
  } = event.queryStringParameters || {};
  if (!listingId || !startDate) {
    return jsonResponse(400, { message: "Missing listingId or startDate" });
  }

  const start = new Date(startDate);
  const end =
    endDate ||
    toIsoDate(addMonths(start, Number.parseInt(months, 10) || 1));

  const qs = new URLSearchParams({
    startDate: toIsoDate(start),
    endDate: endDate || end,
    includeAllotment: "true",
    ignoreInactiveChildAllotment: toBooleanQueryString(
      ignoreInactiveParam,
      DEFAULT_IGNORE_INACTIVE_CHILD_ALLOTMENT
    ),
    ignoreUnlistedChildAllotment: toBooleanQueryString(
      ignoreUnlistedParam,
      DEFAULT_IGNORE_UNLISTED_CHILD_ALLOTMENT
    ),
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings/${listingId}?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      listingId,
      startDate: toIsoDate(start),
      months: Number(months) || 1,
      days: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Calendar pricing failed", error: await res.text() });
  }

  const payload = await res.json();
  const daysRaw =
    payload?.days ||
    payload?.calendar ||
    payload?.data?.days ||
    payload?.data?.calendar ||
    payload?.data?.results ||
    payload?.data ||
    payload?.results ||
    [];
  const currency = payload?.currency || payload?.data?.currency;
  const days = Array.isArray(daysRaw)
    ? daysRaw.map((day) => normalizeCalendarDay(day, currency)).filter(Boolean)
    : [];

  return jsonResponse(200, {
    listingId,
    startDate: toIsoDate(start),
    months: Number(months) || 1,
    days,
    errors: [],
    rateLimited: false,
    tokenSource,
  });
};

const normalizeString = (value) => String(value ?? "").trim();

const diffNights = (checkIn, checkOut) => {
  const start = new Date(String(checkIn || ""));
  const end = new Date(String(checkOut || ""));
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};

const quoteMoneyForPlan = (quoteData, ratePlanId = "") => {
  const plansRaw = Array.isArray(quoteData?.rates?.ratePlans)
    ? quoteData.rates.ratePlans
    : quoteData?.rates?.ratePlans
      ? [quoteData.rates.ratePlans]
      : [];
  const normalizedPlanId = normalizeString(ratePlanId);
  const selected =
    (normalizedPlanId
      ? plansRaw.find((plan) => {
          const meta = plan?.ratePlan || {};
          const id = normalizeString(meta?._id || plan?._id);
          return id && id === normalizedPlanId;
        })
      : null) ||
    plansRaw[0] ||
    null;

  const meta = selected?.ratePlan || {};
  const labelSource = normalizeString(meta?.name || meta?.title || meta?.description || "");
  const nonRefundable =
    Boolean(meta?.cancellationPolicy?.isNonRefundable ?? meta?.nonRefundable) ||
    (/non[- ]?refundable/i.test(labelSource) ? true : false);

  const money =
    selected?.money?.money ||
    selected?.money ||
    quoteData?.money?.money ||
    quoteData?.money ||
    null;
  const days = Array.isArray(selected?.days) ? selected.days : [];
  const currency = normalizeString(money?.currency || days[0]?.currency || quoteData?.currency || "USD") || "USD";

  return {
    selectedPlan: selected,
    selectedPlanId: normalizeString(meta?._id || selected?._id),
    nonRefundable,
    currency,
    money,
    days,
    plansRaw,
  };
};

const sumInvoiceItems = (invoiceItems = []) => {
  const result = {
    accommodation: 0,
    cleaning: 0,
    taxes: 0,
    vat: 0,
    cityTax: 0,
    fees: 0,
  };

  const items = Array.isArray(invoiceItems) ? invoiceItems : [];
  items.forEach((item) => {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount)) return;
    const normalType = String(item?.normalType || item?.type || "").toUpperCase();
    const secondType = String(item?.secondIdentifier || item?.secondType || "").toUpperCase();
    const label = String(item?.title || item?.name || item?.description || "").toUpperCase();

    const isCleaning =
      normalType === "CF" ||
      normalType === "CLEANING_FEE" ||
      /\bCLEAN(ING)?\b/.test(normalType) ||
      /\bCLEAN(ING)?\b/.test(secondType) ||
      /\bCLEAN(ING)?\b/.test(label);

    const isVat =
      normalType === "VAT" ||
      /\bVAT\b/.test(normalType) ||
      /\bVAT\b/.test(secondType) ||
      /\bVAT\b/.test(label);

    const isCityTax =
      normalType === "CT" ||
      normalType === "CITY_TAX" ||
      /\bCITY\s*TAX\b/.test(label) ||
      /\bTOURISM\s*TAX\b/.test(label);

    const isTax =
      normalType === "OCT" ||
      normalType === "TAX" ||
      normalType === "OCCUPANCY_TAX" ||
      isVat ||
      isCityTax ||
      /\b(TAX)\b/.test(normalType) ||
      /\b(TAX)\b/.test(secondType) ||
      /\b(TAX)\b/.test(label);

    if (normalType === "AF" || normalType === "ACCOMMODATION_FARE") {
      result.accommodation += amount;
      return;
    }
    if (isCleaning) {
      result.cleaning += amount;
      return;
    }
    if (isTax) {
      result.taxes += amount;
      if (isVat) result.vat += amount;
      if (isCityTax) result.cityTax += amount;
      return;
    }
    result.fees += amount;
  });

  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, roundMoney(v) || 0]));
};

const summarizeQuotePricing = (quoteData, { checkIn, checkOut, guestsCount = 1, ratePlanId = "" } = {}) => {
  const { money, days, currency, nonRefundable, selectedPlanId } = quoteMoneyForPlan(quoteData, ratePlanId);
  const invoiceItems = Array.isArray(money?.invoiceItems) ? money.invoiceItems : [];
  const inv = sumInvoiceItems(invoiceItems);
  const nights = days.length || diffNights(checkIn, checkOut);
  const safeGuests = Math.max(1, Math.round(Number(guestsCount) || 1));

  const daySum = Array.isArray(days)
    ? days.reduce((sum, d) => {
        const price = d?.manualPrice ?? d?.price ?? d?.basePrice;
        return sum + (typeof price === "number" ? price : 0);
      }, 0)
    : 0;

  const accommodation = firstNumber(money?.fareAccommodation, inv.accommodation, daySum);
  const cleaning = firstNumber(money?.fareCleaning, money?.cleaning, money?.cleaningFee, inv.cleaning);
  const taxes = firstNumber(money?.fareTaxes, money?.fareTax, money?.taxes, money?.taxAmount, money?.totalTaxes, inv.taxes);

  const invoiceItemsTotal = invoiceItems.length
    ? invoiceItems.reduce((sum, item) => sum + (Number.isFinite(Number(item?.amount)) ? Number(item.amount) : 0), 0)
    : null;

  const total = firstNumber(
    money?.totalPrice,
    money?.total,
    quoteData?.total,
    quoteData?.price?.total,
    quoteData?.price?.totalAmount,
    quoteData?.price?.totalPrice,
    typeof quoteData?.price?.total === "object" ? quoteData?.price?.total?.amount : null,
    invoiceItemsTotal,
  );

  const breakdown = {
    accommodation: accommodation !== null ? roundMoney(accommodation) : null,
    cleaning: cleaning !== null ? roundMoney(cleaning) : null,
    taxes: taxes !== null ? roundMoney(taxes) : null,
    vat: inv.vat ? roundMoney(inv.vat) : null,
    cityTax: inv.cityTax ? roundMoney(inv.cityTax) : null,
    fees: inv.fees ? roundMoney(inv.fees) : null,
    subtotal: total !== null ? roundMoney(total) : null,
    total: total !== null ? roundMoney(total) : null,
  };

  return {
    currency,
    nights,
    guestsCount: safeGuests,
    nonRefundable,
    ratePlanId: selectedPlanId || normalizeString(ratePlanId),
    breakdown,
  };
};

const parseVouchersConfig = () => {
  const rawJson = normalizeString(process.env.CHECKOUT_VOUCHERS_JSON || "");
  const legacyCode = normalizeString(process.env.CHECKOUT_DEFAULT_VOUCHER_CODE || "");
  const legacyRate = Number(process.env.CHECKOUT_DEFAULT_VOUCHER_RATE || 0);

  const list = [];
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) list.push(...parsed);
    } catch {
      // ignore malformed JSON
    }
  }
  if (legacyCode && Number.isFinite(legacyRate) && legacyRate > 0) {
    list.push({ code: legacyCode, rate: legacyRate });
  }

  return list
    .map((entry) => ({
      code: normalizeString(entry?.code).toUpperCase(),
      rate: Math.max(0, Math.min(1, Number(entry?.rate) || 0)),
      label: normalizeString(entry?.label || ""),
    }))
    .filter((entry) => entry.code && entry.rate > 0);
};

const VOUCHERS = parseVouchersConfig();
const resolveVoucher = (code) => {
  const normalized = normalizeString(code).toUpperCase();
  if (!normalized) return null;
  return VOUCHERS.find((v) => v.code === normalized) || null;
};

const fetchGuestyQuotesMultiple = async (token, quotes, { mergeAccommodationFarePriceComponents = true } = {}) => {
  const qs = new URLSearchParams({
    mergeAccommodationFarePriceComponents: mergeAccommodationFarePriceComponents ? "true" : "false",
  });
  const res = await fetchWithTimeout(`${OPEN_API_V1}/quotes/multiple?${qs.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ quotes: Array.isArray(quotes) ? quotes : [] }),
  });

  if (res.status === 429) {
    const error = new Error("Rate limited by Guesty");
    error.statusCode = 429;
    throw error;
  }

  const text = await res.text();
  if (!res.ok) {
    const error = new Error(text || `Guesty quotes request failed (${res.status})`);
    error.statusCode = res.status;
    error.body = text;
    throw error;
  }

  return text ? JSON.parse(text) : {};
};

const applyGuestyCouponsToQuote = async (token, quoteId, coupons, { mergeAccommodationFarePriceComponents = true } = {}) => {
  const qs = new URLSearchParams({
    mergeAccommodationFarePriceComponents: mergeAccommodationFarePriceComponents ? "true" : "false",
  });
  const res = await fetchWithTimeout(`${OPEN_API_V1}/quotes/${encodeURIComponent(String(quoteId))}/coupons?${qs.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ coupons: Array.isArray(coupons) ? coupons : [] }),
  });

  const text = await res.text();
  if (!res.ok) {
    const error = new Error(text || `Guesty coupon apply failed (${res.status})`);
    error.statusCode = res.status;
    error.body = text;
    throw error;
  }

  return text ? JSON.parse(text) : {};
};

const createGuestyQuoteForCheckout = async ({
  listingId,
  checkIn,
  checkOut,
  guestsCount,
  ratePlanId = "",
  voucherCode = "",
  mergeAccommodationFarePriceComponents = true,
} = {}) => {
  const { token } = await getGuestyToken();
  const guests = Math.max(1, Math.round(Number(guestsCount) || 1));
  const quoteRequest = {
    checkInDateLocalized: String(checkIn),
    checkOutDateLocalized: String(checkOut),
    unitTypeId: String(listingId),
    ...(ratePlanId ? { ratePlanId: String(ratePlanId) } : {}),
    guestsCount: guests,
    numberOfGuests: { numberOfAdults: guests },
    source: "website",
    applyPromotions: true,
    count: 1,
  };

  const payload = await fetchGuestyQuotesMultiple(token, [quoteRequest], { mergeAccommodationFarePriceComponents });
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const quote = results[0] || null;
  if (!quote) {
    throw new Error("Guesty quote response did not include a quote result.");
  }

  const quoteId = quote?._id || quote?.id || null;
  if (!quoteId) {
    throw new Error("Guesty quote response missing quote id.");
  }

  const before = summarizeQuotePricing(quote, {
    checkIn,
    checkOut,
    guestsCount: guests,
    ratePlanId,
  });

  const normalizedVoucherCode = normalizeString(voucherCode).toUpperCase();
  if (!normalizedVoucherCode) {
    return { quote, quoteId, pricing: before, pricingBefore: before, voucher: null, discountAmount: 0 };
  }

  const voucher = resolveVoucher(normalizedVoucherCode);
  if (!voucher) {
    const error = new Error("Invalid voucher code.");
    error.statusCode = 400;
    throw error;
  }

  let afterQuote = quote;
  try {
    afterQuote = await applyGuestyCouponsToQuote(token, quoteId, [voucher.code], {
      mergeAccommodationFarePriceComponents,
    });
  } catch (err) {
    const message = String(err?.body || err?.message || "");
    const wrapped = new Error(
      message
        ? `Unable to apply voucher in Guesty: ${message}`
        : "Unable to apply voucher in Guesty.",
    );
    wrapped.statusCode = Number(err?.statusCode) || 502;
    throw wrapped;
  }

  const after = summarizeQuotePricing(afterQuote, {
    checkIn,
    checkOut,
    guestsCount: guests,
    ratePlanId,
  });

  const totalBefore = Number(before?.breakdown?.total);
  const totalAfter = Number(after?.breakdown?.total);
  const discountAmount =
    Number.isFinite(totalBefore) && Number.isFinite(totalAfter) && totalBefore > totalAfter
      ? roundMoney(totalBefore - totalAfter) || 0
      : 0;

  return {
    quote: afterQuote,
    quoteId,
    pricing: after,
    pricingBefore: before,
    voucher,
    discountAmount,
  };
};

const createGuestyReservationFromQuote = async ({ quoteId, guest, status = "confirmed" } = {}) => {
  const { token } = await getGuestyToken();
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
  const firstName = guest?.firstName || nameParts[0] || "Guest";
  const lastName = guest?.lastName || nameParts.slice(1).join(" ") || "Guest";
  const phone = normalizeString(guest?.phone || "");
  const phones = phone ? [phone] : [];

  const res = await fetchWithTimeout(`${OPEN_API_V1}/reservations-v3/quote`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      quoteId: String(quoteId),
      status: status || "confirmed",
      guest: {
        firstName,
        lastName,
        phones,
        email: guest?.email || "",
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const error = new Error(text || `Guesty reservation-from-quote failed (${res.status})`);
    error.statusCode = res.status;
    error.body = text;
    throw error;
  }

  return text ? JSON.parse(text) : {};
};

const createGuestyInvoiceItem = async (reservationId, { title, amount, normalType, secondIdentifier, description } = {}) => {
  const numericAmount = roundMoney(amount);
  if (!reservationId) return null;
  if (!Number.isFinite(numericAmount) || numericAmount === 0) return null;
  const safeTitle = normalizeString(title) || "Additional fee";
  const safeNormalType = normalizeString(normalType).toUpperCase() || "AFE";
  const safeSecond = normalizeString(secondIdentifier).toUpperCase() || "MISCELLANEOUS";
  const safeDescription = normalizeString(description);

  const { token } = await getGuestyToken();
  const postOnce = async (path, body) => {
    const res = await fetchWithTimeout(`${OPEN_API_V1}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const error = new Error(text || `Guesty invoice item create failed (${res.status})`);
      error.statusCode = res.status;
      error.body = text;
      throw error;
    }
    return text ? JSON.parse(text) : {};
  };

  const body = {
    title: safeTitle,
    amount: numericAmount,
    normalType: safeNormalType,
    ...(safeNormalType === "AFE" ? { secondIdentifier: safeSecond } : {}),
    ...(safeDescription ? { description: safeDescription } : {}),
  };

  try {
    return await postOnce(`/invoice-items/reservation/${encodeURIComponent(String(reservationId))}`, body);
  } catch (err) {
    const msg = String(err?.body || err?.message || "");
    const isNotFoundOrDenied = Number(err?.statusCode) === 404 || Number(err?.statusCode) === 403;
    if (!isNotFoundOrDenied) throw err;

    // Legacy fallback (deprecated Guesty API path).
    return await postOnce(`/reservations/${encodeURIComponent(String(reservationId))}/invoiceItems`, {
      ...body,
      secondIdentifier: safeSecond,
    });
  }
};

const createMinimalGuestyReservationPayload = ({ listingId, checkIn, checkOut, guests, guest } = {}) => {
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
  const firstName = guest?.firstName || nameParts[0] || "Guest";
  const lastName = guest?.lastName || nameParts.slice(1).join(" ") || "Guest";
  const parsedGuests = Number(guests);
  const normalizedGuests =
    Number.isFinite(parsedGuests) && parsedGuests > 0 ? Math.round(parsedGuests) : 1;

  return {
    listingId: String(listingId),
    checkInDateLocalized: String(checkIn),
    checkOutDateLocalized: String(checkOut),
    status: "confirmed",
    source: "website",
    guestsCount: normalizedGuests,
    numberOfGuests: { numberOfAdults: normalizedGuests },
    guest: {
      firstName,
      lastName,
      email: guest?.email || "",
      phone: guest?.phone || "",
    },
  };
};

const handleQuotesBulk = async (event, token, tokenSource) => {
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { message: "Invalid JSON payload" });
  }
  const { requests = [] } = body || {};
  if (!Array.isArray(requests) || !requests.length) {
    return jsonResponse(400, { message: "Missing quote requests" });
  }

  const quotes = requests
    .map((req) => {
      const listingId = req?.listingId;
      if (!listingId || !req?.checkInDateLocalized || !req?.checkOutDateLocalized) return null;
      const guests = Number(req?.guestsCount) || 1;
      return {
        checkInDateLocalized: req.checkInDateLocalized,
        checkOutDateLocalized: req.checkOutDateLocalized,
        unitTypeId: listingId,
        guestsCount: guests,
        numberOfGuests: { numberOfAdults: guests },
        source: "website",
        applyPromotions: true,
        count: 1,
      };
    })
    .filter(Boolean);

  if (!quotes.length) {
    return jsonResponse(400, { message: "No valid quote requests" });
  }

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/quotes/multiple?mergeAccommodationFarePriceComponents=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ quotes }),
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, { results: {}, errors: [{ message: "Rate limited by Guesty" }], rateLimited: true });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Quote bulk failed", error: await res.text() });
  }

  const payload = await res.json();
  const resultsArray = Array.isArray(payload?.results) ? payload.results : [];
  const results = resultsArray.reduce((acc, item) => {
    const key = item?.unitTypeId || item?.listingId || item?._id;
    if (key) {
      const req = (Array.isArray(requests) ? requests : []).find(
        (r) => String(r?.listingId || "") === String(key),
      );
      const summary = summarizeQuotePricing(item, {
        checkIn: req?.checkInDateLocalized,
        checkOut: req?.checkOutDateLocalized,
        guestsCount: Number(req?.guestsCount) || 1,
        ratePlanId: req?.ratePlanId || req?.planId || "",
      });
      acc[key] = { ...item, olsPricing: summary };
    }
    return acc;
  }, {});

  return jsonResponse(200, { results, errors: payload?.errors || [], tokenSource });
};

const fetchReservationPage = async ({
  token,
  filters,
  fields,
  sort,
  limit,
  skip,
  viewId,
}) => {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  qs.set("skip", String(skip));
  qs.set("sort", String(sort || "_id"));

  if (typeof fields === "string" && fields.trim()) {
    qs.set("fields", fields.trim());
  }

  if (typeof viewId === "string" && viewId.trim()) {
    qs.set("viewId", viewId.trim());
  }

  if (filters !== undefined) {
    qs.set("filters", JSON.stringify(filters));
  }

  const res = await fetchWithTimeout(`${OPEN_API_V1}/reservations?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    return {
      rateLimited: true,
      rows: [],
      total: null,
    };
  }

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const payload = await res.json();
  return {
    rateLimited: false,
    rows: normalizeReservationRows(payload),
    total: getReservationTotal(payload),
  };
};

const handleReservationsSearch = async (event, token, tokenSource) => {
  const query = event.queryStringParameters || {};

  let filters;
  let limit;
  let skip;
  let sort;
  let fields;
  let viewId;
  let paginateAll;
  let maxPages;

  try {
    filters = parseJsonArrayQueryParam(query.filters, { key: "filters" });
    limit = parseIntegerQueryParam(query.limit, { key: "limit", min: 1, max: 100, fallback: 25 });
    skip = parseIntegerQueryParam(query.skip, { key: "skip", min: 0, max: 1_000_000, fallback: 0 });
    maxPages = parseIntegerQueryParam(query.maxPages, { key: "maxPages", min: 1, max: 100, fallback: 20 });
    paginateAll = parseBooleanQueryParam(query.paginateAll, { key: "paginateAll", fallback: false });
    sort = String(query.sort || "_id").trim() || "_id";
    fields = typeof query.fields === "string" ? query.fields : "";
    viewId = typeof query.viewId === "string" ? query.viewId : "";
  } catch (err) {
    return jsonResponse(400, { message: err?.message || "Invalid reservations query parameters." });
  }

  let currentSkip = skip;
  let pagesFetched = 0;
  let maxPagesReached = false;
  let rateLimited = false;
  let total = null;
  const results = [];

  try {
    while (pagesFetched < maxPages) {
      const page = await fetchReservationPage({
        token,
        filters,
        fields,
        sort,
        limit,
        skip: currentSkip,
        viewId,
      });

      if (page.rateLimited) {
        rateLimited = true;
        break;
      }

      pagesFetched += 1;
      if (Number.isFinite(page.total)) total = page.total;

      const pageRows = Array.isArray(page.rows) ? page.rows : [];
      results.push(...pageRows);

      const reachedKnownTotal =
        Number.isFinite(total) && (skip + results.length >= total);
      const reachedPageEnd = pageRows.length < limit;

      if (!paginateAll || reachedKnownTotal || reachedPageEnd) {
        break;
      }

      currentSkip += limit;
    }

    if (paginateAll && pagesFetched >= maxPages) {
      const noKnownTotal = !Number.isFinite(total);
      const knownTotalNotReached = Number.isFinite(total) && skip + results.length < total;
      maxPagesReached = noKnownTotal || knownTotalNotReached;
    }
  } catch (err) {
    return jsonResponse(502, {
      message: "Reservations search failed",
      error: err?.message || String(err),
    });
  }

  const hasMore = Number.isFinite(total)
    ? skip + results.length < total
    : rateLimited || maxPagesReached || (!paginateAll && results.length === limit);

  return jsonResponse(200, {
    results,
    tokenSource,
    errors: rateLimited ? [{ message: "Rate limited by Guesty" }] : [],
    rateLimited,
    pagination: {
      sort,
      limit,
      skip,
      returned: results.length,
      pagesFetched,
      paginateAll,
      maxPagesReached,
      total: Number.isFinite(total) ? total : null,
      hasMore,
      nextSkip: hasMore ? skip + results.length : null,
    },
  });
};

const handleFreeCheckout = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const {
    listingId,
    listingTitle,
    checkIn,
    checkOut,
    guests,
    breakdown: incomingBreakdown,
    promoCode,
    voucherCode,
    ratePlanId,
    guest,
    consentText,
    consentAcceptedAt,
    consentSignerName,
    consentSignatureDataUrl,
    verification,
  } = body || {};

  if (!listingId || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing listingId or dates" });
  }

  if (!guest?.email) {
    return jsonResponse(400, { message: "Guest email is required" });
  }

  const guestsCount = Math.max(1, Math.round(Number(guests) || 1));
  const requestedVoucherCode = normalizeString(voucherCode || promoCode).toUpperCase();
  const defaultVoucherCode = normalizeString(process.env.CHECKOUT_DEFAULT_VOUCHER_CODE).toUpperCase();
  const effectiveVoucherCode = requestedVoucherCode || defaultVoucherCode;

  let quoteResult;
  try {
    quoteResult = await createGuestyQuoteForCheckout({
      listingId,
      checkIn,
      checkOut,
      guestsCount,
      ratePlanId: normalizeString(ratePlanId),
      voucherCode: effectiveVoucherCode,
      mergeAccommodationFarePriceComponents: true,
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 502;
    return jsonResponse(status >= 400 && status < 500 ? status : 502, {
      message: err?.message || "Unable to fetch Guesty pricing.",
      error: err?.message || "Unknown error",
    });
  }

  const quoteId = quoteResult?.quoteId || "";
  const pricing = quoteResult?.pricing || null;
  const pricingBreakdown = pricing?.breakdown || null;
  const normalizedCurrency = (normalizeString(pricing?.currency || "USD") || "USD").toUpperCase();
  const quoteTotal = pricingBreakdown ? Number(pricingBreakdown.total ?? pricingBreakdown.subtotal) : NaN;
  if (!Number.isFinite(quoteTotal) || quoteTotal < 0) {
    return jsonResponse(502, { message: "Guesty quote did not include a valid total." });
  }

  const resolvedPromoCode = quoteResult?.voucher?.code || "";
  const resolvedPromoDiscountAmount = Number.isFinite(Number(quoteResult?.discountAmount))
    ? Number(quoteResult.discountAmount)
    : 0;
  const resolvedPromoDiscountRate = Number.isFinite(Number(quoteResult?.voucher?.rate))
    ? Number(quoteResult.voucher.rate)
    : 0;

  const resolvedSecurityDeposit = await resolveSecurityDeposit({
    listingId,
    country: incomingBreakdown?.country || body?.country || body?.listingCountry,
    bedrooms: incomingBreakdown?.bedrooms || body?.bedrooms || body?.listingBedrooms,
    currency: normalizedCurrency,
  });

  const baseCheckoutBreakdown =
    pricingBreakdown && typeof pricingBreakdown === "object"
      ? {
          ...pricingBreakdown,
          promoCode: resolvedPromoCode,
          promoDiscountAmount: resolvedPromoDiscountAmount,
          promoDiscountRate: resolvedPromoDiscountRate,
        }
      : null;

  const withSecurityDeposit = applySecurityDepositToAmount({
    numericAmount: quoteTotal,
    breakdown: baseCheckoutBreakdown,
    securityDepositAmount: resolvedSecurityDeposit?.amount || 0,
    securityDepositCurrency: resolvedSecurityDeposit?.currency || normalizedCurrency,
  });
  const numericAmount = withSecurityDeposit.numericAmount;
  const breakdown = withSecurityDeposit.breakdown;
  if (!Number.isFinite(numericAmount) || numericAmount > 0) {
    return jsonResponse(400, {
      message: "Zero-total checkout is only available when total amount is 0.00 or below.",
    });
  }

  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const normalizedVerification = normalizeVerificationPayload(verification || {});

  const confirmationId = `FREE-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const baseUrl = getBaseUrl(event);
  let reservationId = null;

  try {
    let reservation = null;
    if (quoteId) {
      try {
        reservation = await createGuestyReservationFromQuote({ quoteId, guest, status: "confirmed" });
      } catch {
        reservation = null;
      }
    }

    if (!reservation) {
      const reservationPayload = createMinimalGuestyReservationPayload({
        listingId,
        checkIn,
        checkOut,
        guests: guestsCount,
        guest,
      });
      reservation = await createGuestyReservation(reservationPayload);
    }

    reservationId = reservation?._id || reservation?.id || null;
  } catch (err) {
    return jsonResponse(502, {
      message: "Unable to create reservation in Guesty.",
      error: err?.message || "Unknown error",
    });
  }

  await writeConsentProof(confirmationId, {
    createdAt: new Date().toISOString(),
    sessionId: confirmationId,
    paymentMode: "zero-total",
    reservationId: reservationId || "",
    listingId: String(listingId),
    listingTitle: listingTitle || "",
    checkIn,
    checkOut,
    guests: Number(guests) || 1,
    amount: numericAmount,
    currency: normalizedCurrency,
    consentText: consentText || "",
    consentAcceptedAt: consentAcceptedAt || "",
    consentSignerName: consentSignerName || "",
    consentSignatureDataUrl: consentSignatureDataUrl || "",
    verification: normalizedVerification,
    promoCode: resolvedPromoCode,
    promoDiscountAmount: resolvedPromoDiscountAmount,
    promoDiscountRate: resolvedPromoDiscountRate,
    guestName,
    guestEmail: guest?.email || "",
    guestPhone: guest?.phone || "",
  });

  let consentPdfToken = null;
  let consentPdfUrl = null;
  let consentPdfBytes = null;
  let consentPdfError = null;
  try {
    consentPdfBytes = await buildConsentPdf({
      confirmationId,
      reservationId,
      listingTitle,
      checkIn,
      checkOut,
      guests: Number(guests) || 1,
      amount: numericAmount,
      currency: normalizedCurrency,
      guestName,
      guestEmail: guest?.email || "",
      consentText: consentText || "",
      consentAcceptedAt: consentAcceptedAt || "",
      consentSignerName: consentSignerName || guestName || "",
      consentSignatureDataUrl: consentSignatureDataUrl || "",
      verification: normalizedVerification,
    });
    consentPdfToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
    const stored = await writeConsentPdf(consentPdfToken, consentPdfBytes, {
      reservationId: reservationId || "",
      confirmationId,
    });
    if (!stored) {
      throw new Error("Consent proof storage unavailable");
    }
    const proofBaseUrl = toProofBaseUrl(event);
    if (proofBaseUrl) {
      consentPdfUrl = `${proofBaseUrl}/.netlify/functions/consent-proof?token=${encodeURIComponent(consentPdfToken)}`;
    } else {
      consentPdfError = "Consent proof saved, but no public base URL is configured for proof links.";
    }
  } catch (err) {
    consentPdfError = err?.message || "Unable to generate consent proof PDF.";
  }

  let emailSent = false;
  let emailError = null;
  try {
    const formattedAmount = formatCurrencyValue(numericAmount, normalizedCurrency);
    const recipients = Array.from(
      new Set([guest.email, RESERVATIONS_COPY_EMAIL].filter(Boolean)),
    );
    const emailResult = await sendReservationEmail({
      to: recipients,
      subject: "OneLuxStay Booking Confirmation",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #3f3326;">
          <h2>Thank you for booking with OneLuxStay</h2>
          <p>Hi ${escapeHtml(guestName || "Guest")},</p>
          <p>Your reservation request has been confirmed. No payment was required for this booking.</p>
          <p><strong>Confirmation ID:</strong> ${escapeHtml(confirmationId)}</p>
          ${reservationId ? `<p><strong>Reservation ID:</strong> ${escapeHtml(reservationId)}</p>` : ""}
          <p><strong>Listing:</strong> ${escapeHtml(listingTitle || "OneLuxStay stay")}</p>
          <p><strong>Check-in:</strong> ${escapeHtml(checkIn)}</p>
          <p><strong>Check-out:</strong> ${escapeHtml(checkOut)}</p>
          <p><strong>Guests:</strong> ${escapeHtml(String(Number(guests) || 1))}</p>
          <p><strong>Total charged:</strong> ${escapeHtml(formattedAmount)}</p>
          ${consentPdfUrl ? `<p><strong>Consent proof PDF:</strong> <a href="${consentPdfUrl}" target="_blank" rel="noreferrer">Download PDF</a></p>` : ""}
          <p>Our reservations team will follow up shortly with any final details.</p>
        </div>
      `,
      attachments:
        consentPdfBytes && consentPdfBytes.length
          ? [
              {
                filename: `consent-proof-${reservationId || confirmationId}.pdf`,
                content: Buffer.from(consentPdfBytes).toString("base64"),
                type: "application/pdf",
              },
            ]
          : [],
    });
    emailSent = !emailResult?.skipped;
  } catch (err) {
    emailError = err?.message || "Unable to send confirmation email.";
  }

  const query = new URLSearchParams({
    mode: "free",
    confirmationId,
    reservationId: String(reservationId || ""),
    email: String(guest?.email || ""),
    emailSent: emailSent ? "1" : "0",
    listingTitle: String(listingTitle || ""),
    checkIn: String(checkIn),
    checkOut: String(checkOut),
    guests: String(Number(guests) || 1),
    amount: String(numericAmount),
    currency: normalizedCurrency,
    consentProofUrl: String(consentPdfUrl || ""),
  });
  const redirectUrl = `${baseUrl}/booking-confirmation?${query.toString()}`;

  return jsonResponse(200, {
    ok: true,
    freeCheckout: true,
    confirmationId,
    reservationId,
    emailSent,
    redirectUrl,
    consentPdfUrl,
    ...(consentPdfError ? { consentPdfError } : {}),
    ...(emailError ? { emailError } : {}),
  });
};

const handleCheckout = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const {
    listingId,
    listingTitle,
    checkIn,
    checkOut,
    guests,
    breakdown: incomingBreakdown,
    promoCode,
    voucherCode,
    ratePlanId,
    guest,
    consentText,
    consentAcceptedAt,
    consentSignerName,
    consentSignatureDataUrl,
    verification,
    cancelPath,
  } = body || {};

  if (!listingId || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing listingId or dates" });
  }

  if (!guest?.email) {
    return jsonResponse(400, { message: "Guest email is required" });
  }

  const guestsCount = Math.max(1, Math.round(Number(guests) || 1));
  const requestedVoucherCode = normalizeString(voucherCode || promoCode).toUpperCase();

  let quoteResult;
  try {
    quoteResult = await createGuestyQuoteForCheckout({
      listingId,
      checkIn,
      checkOut,
      guestsCount,
      ratePlanId: normalizeString(ratePlanId),
      voucherCode: effectiveVoucherCode,
      mergeAccommodationFarePriceComponents: true,
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 502;
    return jsonResponse(status >= 400 && status < 500 ? status : 502, {
      message: err?.message || "Unable to fetch Guesty pricing.",
      error: err?.message || "Unknown error",
    });
  }

  const quoteId = quoteResult?.quoteId || "";
  const pricing = quoteResult?.pricing || null;
  const pricingBreakdown = pricing?.breakdown || null;
  const quoteCurrency = (normalizeString(pricing?.currency || "USD") || "USD").toUpperCase();
  const quoteTotal = pricingBreakdown ? Number(pricingBreakdown.total ?? pricingBreakdown.subtotal) : NaN;
  if (!Number.isFinite(quoteTotal) || quoteTotal < 0) {
    return jsonResponse(502, { message: "Guesty quote did not include a valid total." });
  }

  const resolvedPromoCode = quoteResult?.voucher?.code || "";
  const resolvedPromoDiscountAmount = Number.isFinite(Number(quoteResult?.discountAmount))
    ? Number(quoteResult.discountAmount)
    : 0;
  const resolvedPromoDiscountRate = Number.isFinite(Number(quoteResult?.voucher?.rate))
    ? Number(quoteResult.voucher.rate)
    : 0;

  const resolvedSecurityDeposit = await resolveSecurityDeposit({
    listingId,
    country: incomingBreakdown?.country || body?.country || body?.listingCountry,
    bedrooms: incomingBreakdown?.bedrooms || body?.bedrooms || body?.listingBedrooms,
    currency: quoteCurrency,
  });

  const baseCheckoutBreakdown =
    pricingBreakdown && typeof pricingBreakdown === "object"
      ? {
          ...pricingBreakdown,
          promoCode: resolvedPromoCode,
          promoDiscountAmount: resolvedPromoDiscountAmount,
          promoDiscountRate: resolvedPromoDiscountRate,
        }
      : null;

  const withSecurityDeposit = applySecurityDepositToAmount({
    numericAmount: quoteTotal,
    breakdown: baseCheckoutBreakdown,
    securityDepositAmount: resolvedSecurityDeposit?.amount || 0,
    securityDepositCurrency: resolvedSecurityDeposit?.currency || quoteCurrency,
  });
  const numericAmount = withSecurityDeposit.numericAmount;
  const breakdown = withSecurityDeposit.breakdown;

  const unitAmount = toStripeAmount(numericAmount, quoteCurrency);
  if (!unitAmount || unitAmount <= 0) {
    return jsonResponse(400, { message: "Invalid amount. Use zero-total checkout if total is 0." });
  }

  const stripe = getStripeClient();
  const baseUrl = getBaseUrl(event);
  const returnTo = withBookingSearchParams(
    sanitizeInternalPath(cancelPath) || getRefererPath(event) || "/",
    { checkIn, checkOut, guests },
  );
  const cancelQuery = new URLSearchParams({
    checkout: "cancelled",
    returnTo,
  });
  if (checkIn) cancelQuery.set("checkIn", String(checkIn));
  if (checkOut) cancelQuery.set("checkOut", String(checkOut));
  if (Number.isFinite(Number(guests)) && Number(guests) > 0) {
    cancelQuery.set("guests", String(Math.round(Number(guests))));
  }
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const normalizedVerification = normalizeVerificationPayload(verification || {});

  const clientTotalCandidate = firstNumber(
    incomingBreakdown?.total,
    incomingBreakdown?.subtotal,
    body?.amount,
    body?.price?.grand_total,
    body?.price?.grandTotal,
  );
  if (
    Number.isFinite(clientTotalCandidate) &&
    Number.isFinite(numericAmount) &&
    Math.abs(Number(clientTotalCandidate) - Number(numericAmount)) >= 0.5
  ) {
    console.warn("[check-units] Pricing mismatch between client and server quote; proceeding with server total.", {
      listingId,
      checkIn,
      checkOut,
      guests: guestsCount,
      client_total: Number(clientTotalCandidate),
      server_total: Number(numericAmount),
      currency: quoteCurrency,
      voucher: resolvedPromoCode || "",
      quoteId: quoteId || "",
    });
  }

  const breakdownFields =
    breakdown && typeof breakdown === "object"
      ? {
          bd_accommodation: breakdown.accommodation,
          bd_cleaning: breakdown.cleaning,
          bd_taxes: breakdown.taxes,
          bd_vat: breakdown.vat,
          bd_city_tax: breakdown.cityTax,
          bd_fees: breakdown.fees,
          bd_security_deposit: breakdown.securityDeposit,
          bd_discount: breakdown.discountAmount,
          bd_discount_rate: breakdown.discountRate,
          bd_promo_discount: resolvedPromoDiscountAmount,
          bd_promo_discount_rate: resolvedPromoDiscountRate,
          bd_total: breakdown.total ?? breakdown.subtotal,
        }
      : null;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: guest?.email,
    client_reference_id: listingId ? String(listingId) : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: quoteCurrency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: listingTitle || "OneLuxStay reservation",
            description: `Check-in ${checkIn} - Check-out ${checkOut} - Guests ${guests || 1}`,
          },
        },
      },
    ],
    success_url: `${baseUrl}/booking-confirmation?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?${cancelQuery.toString()}`,
    metadata: {
      listingId: String(listingId),
      listingTitle: String(listingTitle || ""),
      checkIn,
      checkOut,
      guests: String(guests || 1),
      amount: String(numericAmount),
      currency: quoteCurrency.toLowerCase(),
      ...(quoteId ? { quote_id: String(quoteId) } : {}),
      security_deposit: String(withSecurityDeposit.securityDeposit || 0),
      security_deposit_currency: String(
        withSecurityDeposit.securityDepositCurrency || quoteCurrency,
      ).toUpperCase(),
      ...(consentText ? { consent_text: String(consentText) } : {}),
      ...(consentAcceptedAt ? { consent_at: String(consentAcceptedAt) } : {}),
      ...(consentSignerName ? { consent_signer_name: String(consentSignerName).slice(0, 200) } : {}),
      ...(consentSignatureDataUrl ? { consent_signature: "true" } : {}),
      ...(resolvedPromoCode ? { promo_code: String(resolvedPromoCode).slice(0, 80) } : {}),
      ...(breakdownFields
        ? Object.fromEntries(
            Object.entries(breakdownFields)
              .filter(([, value]) => Number.isFinite(Number(value)))
              .map(([key, value]) => [key, String(value)]),
          )
        : {}),
      ...(typeof breakdown?.taxProfile === "string" && breakdown.taxProfile.trim()
        ? { bd_tax_profile: breakdown.taxProfile.trim() }
        : {}),
      guestName,
      guestFirstName: guest?.firstName || "",
      guestLastName: guest?.lastName || "",
      guestEmail: guest?.email || "",
      guestPhone: guest?.phone || "",
    },
  });

  await writeConsentProof(session.id, {
    createdAt: new Date().toISOString(),
    sessionId: session.id,
    listingId: String(listingId),
    listingTitle: listingTitle || "",
    checkIn,
    checkOut,
    guests: Number(guests) || 1,
    amount: numericAmount,
    currency: quoteCurrency.toUpperCase(),
    consentText: consentText || "",
    consentAcceptedAt: consentAcceptedAt || "",
    consentSignerName: consentSignerName || "",
    consentSignatureDataUrl: consentSignatureDataUrl || "",
    verification: normalizedVerification,
    promoCode: resolvedPromoCode,
    promoDiscountAmount: resolvedPromoDiscountAmount,
    promoDiscountRate: resolvedPromoDiscountRate,
    guestName,
    guestEmail: guest?.email || "",
    guestPhone: guest?.phone || "",
  });

  return jsonResponse(200, {
    url: session.url,
    id: session.id,
    amount: numericAmount,
    currency: quoteCurrency,
    quoteId: quoteId || "",
    breakdown: breakdown || null,
    promoCode: resolvedPromoCode || "",
    promoDiscountAmount: resolvedPromoDiscountAmount || 0,
    promoDiscountRate: resolvedPromoDiscountRate || 0,
  });
};

const buildPaidConfirmationRedirectUrl = (baseUrl, summary = {}) => {
  const query = new URLSearchParams({
    mode: "paid",
    confirmationId: String(summary.sessionId || ""),
    reservationId: String(summary.reservationId || ""),
    email: String(summary.email || ""),
    emailSent: summary.emailSent ? "1" : "0",
    listingTitle: String(summary.listingTitle || ""),
    checkIn: String(summary.checkIn || ""),
    checkOut: String(summary.checkOut || ""),
    guests: String(summary.guests || ""),
    amount: String(summary.amount ?? ""),
    currency: String(summary.currency || "USD"),
    consentProofUrl: String(summary.consentProofUrl || ""),
  });
  return `${baseUrl}/booking-confirmation?${query.toString()}`;
};

const handleCheckoutSuccess = async (event) => {
  const query = event.queryStringParameters || {};
  const sessionId = String(query.session_id || query.sessionId || "").trim();
  if (!sessionId) {
    return jsonResponse(400, { message: "Missing session_id" });
  }

  const baseUrl = getBaseUrl(event);
  let cached = await readStripeSessionRecord(sessionId);
  if (
    !cached?.reservationId &&
    !cached?.processedAt &&
    Number(cached?.processingAt || 0) &&
    Date.now() - Number(cached?.processingAt || 0) < STRIPE_SESSION_PROCESSING_STALE_MS
  ) {
    const waited = await waitForStripeSessionReservation(sessionId);
    if (waited) cached = waited;
  }
  if (cached?.redirectUrl) {
    return jsonResponse(200, {
      ok: true,
      finalized: true,
      cached: true,
      redirectUrl: cached.redirectUrl,
      reservationId: cached.reservationId || "",
      paymentError: cached.paymentError || "",
      emailSent: !cached.emailError,
      emailError: cached.emailError || "",
    });
  }

  let session;
  let lastStripeLookupError = null;
  const stripeKeys = parseStripeSecretKeys();
  if (!stripeKeys.length) {
    stripeKeys.push(String(process.env.STRIPE_SECRET_KEY || "").trim());
  }

  for (const stripeKey of stripeKeys.filter(Boolean)) {
    const stripe = getStripeClient(stripeKey);
    try {
      session = await retrieveStripeCheckoutSession(stripe, sessionId, {
        expand: ["payment_intent.latest_charge"],
      });
      if (session?.id) break;
    } catch (err) {
      lastStripeLookupError = err;
      const message = String(err?.message || "");
      if (/no such checkout\.session/i.test(message)) {
        continue;
      }
      throw err;
    }
  }

  if (!session?.id) {
    const message = String(lastStripeLookupError?.message || "");
    if (/no such checkout\.session/i.test(message)) {
      return jsonResponse(404, {
        message:
          "Stripe session not found for configured Stripe key(s). Check that STRIPE_SECRET_KEY/STRIPE_SECRET_KEYS match the Stripe account and mode used for checkout.",
        error: message,
        sessionId,
      });
    }
    return jsonResponse(404, {
      message: "Stripe session not found",
      sessionId,
      ...(message ? { error: message } : {}),
    });
  }
  if (session.payment_status !== "paid") {
    return jsonResponse(409, {
      message: "Payment is not completed yet.",
      paymentStatus: session.payment_status || "unpaid",
    });
  }

  const metadata = session?.metadata || {};
  const listingId = metadata.listingId;
  const checkIn = metadata.checkIn;
  const checkOut = metadata.checkOut;
  const guests = Number(metadata.guests) || 1;
  const consentPayload = (await readConsentProof(sessionId)) || {};
  const resolvedListingTitle =
    consentPayload?.listingTitle || metadata?.listingTitle || "OneLuxStay stay";
  if (!listingId || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing reservation metadata in Stripe session." });
  }

  const guestEmail = getSessionGuestEmail(session);
  const guestName =
    [metadata.guestFirstName, metadata.guestLastName].filter(Boolean).join(" ").trim() ||
    metadata.guestName ||
    "";
  const guest = {
    firstName: metadata.guestFirstName || guestName.split(/\s+/)[0] || "Guest",
    lastName: metadata.guestLastName || guestName.split(/\s+/).slice(1).join(" ") || "Guest",
    email: guestEmail,
    phone: metadata.guestPhone || "",
  };

  const amount =
    firstNumber(
      Number.isFinite(session?.amount_total)
        ? fromStripeAmount(session.amount_total, session?.currency)
        : null,
      metadata.bd_total,
      metadata.amount,
    ) || 0;
  const breakdown = {
    accommodation: firstNumber(metadata.bd_accommodation),
    cleaning: firstNumber(metadata.bd_cleaning),
    fees: firstNumber(metadata.bd_fees),
    taxes: firstNumber(metadata.bd_taxes),
    securityDeposit: firstNumber(metadata.bd_security_deposit, metadata.security_deposit),
    vat: firstNumber(metadata.bd_vat),
    cityTax: firstNumber(metadata.bd_city_tax),
    taxProfile: typeof metadata.bd_tax_profile === "string" ? metadata.bd_tax_profile : "",
    total: amount,
    subtotal: amount,
    discountAmount: firstNumber(metadata.bd_discount) || 0,
    discountRate: firstNumber(metadata.bd_discount_rate) || 0,
    promoCode: metadata.promo_code || "",
    promoDiscountAmount: firstNumber(metadata.bd_promo_discount) || 0,
    promoDiscountRate: firstNumber(metadata.bd_promo_discount_rate) || 0,
  };

  if (cached?.reservationId || cached?.processedAt) {
    const redirectUrl = buildPaidConfirmationRedirectUrl(baseUrl, {
      sessionId,
      reservationId: cached?.reservationId || "",
      email: guestEmail,
      emailSent: !cached?.emailError,
      listingTitle: resolvedListingTitle,
      checkIn,
      checkOut,
      guests,
      amount,
      currency: (metadata.currency || session?.currency || "USD").toUpperCase(),
      consentProofUrl: cached?.consentPdfUrl || "",
    });
    await writeStripeSessionRecord(sessionId, {
      ...cached,
      redirectUrl,
      lastCheckoutSuccessLookupAt: Date.now(),
    });
    return jsonResponse(200, {
      ok: true,
      finalized: true,
      cached: true,
      sessionId,
      reservationId: cached?.reservationId || "",
      emailSent: !cached?.emailError,
      emailError: cached?.emailError || "",
      redirectUrl,
    });
  }

  const claim = await claimStripeSessionProcessing(sessionId, "checkout-success");
  if (!claim.claimed) {
    const finalRecord = claim.record?.reservationId
      ? claim.record
      : await waitForStripeSessionReservation(sessionId);
    if (finalRecord?.reservationId || finalRecord?.processedAt) {
      const redirectUrl =
        finalRecord?.redirectUrl ||
        buildPaidConfirmationRedirectUrl(baseUrl, {
          sessionId,
          reservationId: finalRecord?.reservationId || "",
          email: guestEmail,
          emailSent: !finalRecord?.emailError,
          listingTitle: resolvedListingTitle,
          checkIn,
          checkOut,
          guests,
          amount,
          currency: (metadata.currency || session?.currency || "USD").toUpperCase(),
          consentProofUrl: finalRecord?.consentPdfUrl || "",
        });
      if (redirectUrl && !finalRecord?.redirectUrl) {
        await writeStripeSessionRecord(sessionId, {
          ...finalRecord,
          redirectUrl,
          lastCheckoutSuccessLookupAt: Date.now(),
        });
      }
      return jsonResponse(200, {
        ok: true,
        finalized: true,
        cached: true,
        sessionId,
        reservationId: finalRecord?.reservationId || "",
        emailSent: !finalRecord?.emailError,
        emailError: finalRecord?.emailError || "",
        paymentError: finalRecord?.paymentError || "",
        redirectUrl,
      });
    }
    return jsonResponse(409, {
      message: "Booking finalization is already in progress. Please refresh in a few seconds.",
      sessionId,
      reason: claim.reason || "processing",
    });
  }

  let reservationId = "";
  try {
    let reservation = null;
    const quoteId = normalizeString(metadata.quote_id || metadata.quoteId || "");

    if (quoteId) {
      try {
        reservation = await createGuestyReservationFromQuote({ quoteId, guest, status: "confirmed" });
      } catch (err) {
        console.warn("[check-units] Reservation-from-quote failed; falling back to minimal create.", {
          sessionId,
          quoteId,
          error: err?.message || String(err),
        });
        reservation = null;
      }
    }

    if (!reservation) {
      const reservationPayload = createMinimalGuestyReservationPayload({
        listingId,
        checkIn,
        checkOut,
        guests,
        guest,
      });
      reservation = await createGuestyReservation(reservationPayload);
    }

    reservationId = reservation?._id || reservation?.id || "";

    const securityDepositAmount = firstNumber(metadata.bd_security_deposit, metadata.security_deposit);
    if (reservationId && Number.isFinite(Number(securityDepositAmount)) && Number(securityDepositAmount) > 0) {
      try {
        await createGuestyInvoiceItem(reservationId, {
          title: "Security Deposit",
          amount: Number(securityDepositAmount),
          normalType: "AFE",
          secondIdentifier: "DEPOSIT",
          description: "Security deposit collected via OneLuxStay website checkout.",
        });
      } catch (err) {
        console.warn("[check-units] Unable to add security deposit invoice item in Guesty.", {
          reservationId,
          sessionId,
          error: err?.message || String(err),
        });
      }
    }
  } catch (err) {
    await writeStripeSessionRecord(sessionId, {
      ...(cached || {}),
      sessionId,
      listingId: String(listingId),
      source: "checkout-success",
      processingToken: null,
      processingSource: "checkout-success",
      processingAt: 0,
      processingUpdatedAt: Date.now(),
      processingError: err?.message || "Unable to create reservation in Guesty.",
    });
    return jsonResponse(502, {
      message: "Unable to create reservation in Guesty.",
      error: err?.message || "Unknown error",
    });
  }
  await writeStripeSessionRecord(sessionId, {
    ...(cached || {}),
    sessionId,
    reservationId,
    listingId: String(listingId),
    reservationCreatedAt: Date.now(),
    source: "checkout-success",
    processingToken: claim.token || null,
    processingSource: "checkout-success",
    processingAt: claim.record?.processingAt || Date.now(),
    processingUpdatedAt: Date.now(),
  });
  let paymentError = "";
  try {
    await createReservationPayment(reservationId, session);
  } catch (err) {
    paymentError = err?.message || "Unable to record payment in Guesty.";
    console.error("[check-units] Payment record failed", {
      reservationId,
      sessionId,
      error: paymentError,
    });
  }

  let consentPdfUrl = "";
  let consentPdfError = "";
  let consentPdfBytes = null;
  try {
    const normalizedVerification = normalizeVerificationPayload(consentPayload?.verification || {});
    consentPdfBytes = await buildConsentPdf({
      confirmationId: sessionId,
      reservationId,
      listingTitle: consentPayload?.listingTitle || metadata?.listingTitle || "OneLuxStay stay",
      checkIn,
      checkOut,
      guests,
      amount,
      currency: (metadata.currency || session?.currency || "USD").toUpperCase(),
      guestName: guestName || [guest.firstName, guest.lastName].filter(Boolean).join(" ").trim(),
      guestEmail,
      consentText: consentPayload?.consentText || metadata?.consent_text || "",
      consentAcceptedAt: consentPayload?.consentAcceptedAt || metadata?.consent_at || "",
      consentSignerName:
        consentPayload?.consentSignerName ||
        metadata?.consent_signer_name ||
        guestName ||
        "",
      consentSignatureDataUrl: consentPayload?.consentSignatureDataUrl || "",
      verification: normalizedVerification,
    });
    const consentPdfToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
    const stored = await writeConsentPdf(consentPdfToken, consentPdfBytes, {
      reservationId: reservationId || "",
      sessionId,
    });
    if (!stored) {
      throw new Error("Consent proof storage unavailable");
    }
    const proofBaseUrl = toProofBaseUrl(event);
    if (proofBaseUrl) {
      consentPdfUrl = `${proofBaseUrl}/.netlify/functions/consent-proof?token=${encodeURIComponent(consentPdfToken)}`;
    } else {
      consentPdfError = "Consent proof saved, but no public base URL is configured for proof links.";
    }
  } catch (err) {
    consentPdfError = err?.message || "Unable to generate consent proof PDF.";
  }

  let emailSent = false;
  let emailError = "";
  try {
    const recipients = uniqueEmails([guestEmail, RESERVATIONS_COPY_EMAIL]);
    const emailResult = await sendReservationEmail({
      to: recipients,
      subject: "OneLuxStay Booking Confirmation",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #3f3326;">
          <h2>Thank you for booking with OneLuxStay</h2>
          <p>Hi ${escapeHtml(guestName || "Guest")},</p>
          <p>Your payment was received and your reservation has been confirmed.</p>
          <p><strong>Stripe session:</strong> ${escapeHtml(sessionId)}</p>
          ${reservationId ? `<p><strong>Reservation ID:</strong> ${escapeHtml(reservationId)}</p>` : ""}
          <p><strong>Check-in:</strong> ${escapeHtml(checkIn)}</p>
          <p><strong>Check-out:</strong> ${escapeHtml(checkOut)}</p>
          <p><strong>Guests:</strong> ${escapeHtml(String(guests))}</p>
          <p><strong>Total charged:</strong> ${escapeHtml(formatCurrencyValue(amount, metadata.currency || session?.currency || "USD"))}</p>
          ${consentPdfUrl ? `<p><strong>Consent proof PDF:</strong> <a href="${consentPdfUrl}" target="_blank" rel="noreferrer">Download PDF</a></p>` : ""}
          <p>Our reservations team will follow up shortly with any final details.</p>
        </div>
      `,
      attachments:
        consentPdfBytes && consentPdfBytes.length
          ? [
              {
                filename: `consent-proof-${reservationId || sessionId}.pdf`,
                content: Buffer.from(consentPdfBytes).toString("base64"),
                type: "application/pdf",
              },
            ]
          : [],
    });
    emailSent = !emailResult?.skipped;
  } catch (err) {
    emailError = err?.message || "Unable to send confirmation email.";
  }

  const redirectUrl = buildPaidConfirmationRedirectUrl(baseUrl, {
    sessionId,
    reservationId,
    email: guestEmail,
    emailSent,
    listingTitle: resolvedListingTitle,
    checkIn,
    checkOut,
    guests,
    amount,
    currency: (metadata.currency || session?.currency || "USD").toUpperCase(),
    consentProofUrl: consentPdfUrl,
  });

  await writeStripeSessionRecord(sessionId, {
    processedAt: Date.now(),
    sessionId,
    reservationId,
    listingId: String(listingId),
    paymentError: paymentError || null,
    guestReceiptEmail: guestEmail,
    emailError: emailError || null,
    ...(emailSent ? { emailSentAt: Date.now() } : {}),
    redirectUrl,
    consentPdfUrl,
    consentPdfError: consentPdfError || null,
  });

  return jsonResponse(200, {
    ok: true,
    finalized: true,
    sessionId,
    reservationId,
    paymentError,
    emailSent,
    emailError,
    consentPdfUrl,
    consentPdfError,
    redirectUrl,
  });
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const path = resolveFunctionPath(event);

  try {
    if (path === "/checkout" && event.httpMethod === "POST") {
      try {
        return await handleCheckout(event);
      } catch (err) {
        const rawMessage =
          err?.raw?.message ||
          err?.message ||
          "Checkout failed";
        const message = String(rawMessage);
        const lower = message.toLowerCase();
        const isClientError =
          lower.includes("minimum") ||
          lower.includes("amount") ||
          lower.includes("invalid") ||
          lower.includes("currency") ||
          lower.includes("email") ||
          lower.includes("missing stripe_secret_key") ||
          lower.includes("api key");
        return jsonResponse(isClientError ? 400 : 500, {
          message,
          error: message,
        });
      }
    }

    if (path === "/checkout-free" && event.httpMethod === "POST") {
      try {
        return await handleFreeCheckout(event);
      } catch (err) {
        return jsonResponse(500, { message: "Zero-total checkout failed", error: err.message });
      }
    }

    if (path === "/checkout-success" && (event.httpMethod === "GET" || event.httpMethod === "POST")) {
      try {
        return await handleCheckoutSuccess(event);
      } catch (err) {
        return jsonResponse(500, {
          message: err?.message || "Unable to finalize checkout.",
          error: err?.message || "Unknown error",
        });
      }
    }

    let tokenPayload;
    try {
      tokenPayload = await getGuestyToken();
    } catch (err) {
      return jsonResponse(500, {
        message: "Unable to authenticate with Guesty",
        error: err?.message || String(err),
      });
    }

    const { token, source } = tokenPayload;

    if (path === "/listings/availability-bulk" && event.httpMethod === "GET") {
      return handleAvailabilityBulk(event, token, source);
    }

    if (path === "/listings/availability-query" && event.httpMethod === "GET") {
      return handleAvailabilityQuery(event, token, source);
    }

    if (path.startsWith("/listings/") && path.endsWith("/calendar-prices") && event.httpMethod === "GET") {
      const listingId = path.split("/")[2];
      return handleCalendarPrices(event, token, source, listingId);
    }

    if (path === "/listings/calendar-multi" && event.httpMethod === "GET") {
      return handleCalendarMulti(event, token, source);
    }

    if (path === "/reservations/quotes-bulk" && event.httpMethod === "POST") {
      return handleQuotesBulk(event, token, source);
    }

    if (path === "/reservations" && event.httpMethod === "GET") {
      return handleReservationsSearch(event, token, source);
    }

    return jsonResponse(404, { message: "Not Found", path });
  } catch (err) {
    return jsonResponse(500, {
      message: "check-units handler failed",
      path,
      error: err?.message || String(err),
    });
  }
}
