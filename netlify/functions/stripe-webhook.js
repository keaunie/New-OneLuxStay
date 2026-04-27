import Stripe from "stripe";
import { getStore } from "@netlify/blobs";
import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getGuestyOpenApiCredentials } from "./_shared/guestyEnv.js";

const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const STRIPE_EVENT_STORE = "stripe-webhook-events";
const CONSENT_STORE_NAME = "consent-proofs";
const CONSENT_PDF_STORE_NAME = "consent-proof-pdfs";
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

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getHeaderValue = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();
  if (!target) return "";

  const headers = event?.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== target) continue;
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
  }

  const multiValueHeaders = event?.multiValueHeaders || {};
  for (const [key, value] of Object.entries(multiValueHeaders)) {
    if (String(key).toLowerCase() !== target) continue;
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
  }

  return "";
};

const parseWebhookSecrets = () => {
  const sources = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRETS,
    process.env.STRIPE_WEBHOOK_SECRET_NEXT,
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

const fetchWithTimeout = async (url, options = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const getBlobStore = async (name) => {
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const apiToken = process.env.NETLIFY_API_TOKEN;
    return siteID && apiToken ? getStore(name, { siteID, token: apiToken }) : getStore(name);
  } catch {
    return null;
  }
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
    return { token: globalThis.GUESTY_TOKEN };
  }

  const store = await getBlobStore(TOKEN_STORE_NAME);
  if (store) {
    let cached = await store.get(TOKEN_KEY, { type: "json" });
    if (!cached) {
      const raw = await store.get(TOKEN_KEY, { type: "text" });
      cached = raw ? JSON.parse(raw) : null;
    }
    if (cached && cached.token && cached.expiresAt > now + 60_000) {
      globalThis.GUESTY_TOKEN = cached.token;
      globalThis.GUESTY_TOKEN_EXPIRES = cached.expiresAt;
      return { token: cached.token };
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
  return { token: tokenData.token };
};

let stripeClient;
const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
};

const getSessionReceiptDetails = async (session) => {
  if (!session?.id) return { receiptUrl: null, paymentIntentId: null, chargeId: null };
  const stripe = getStripeClient();
  try {
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent.latest_charge"],
    });
    const paymentIntent = fullSession?.payment_intent;
    const paymentIntentId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id || null;
    const latestCharge =
      typeof paymentIntent === "object" ? paymentIntent?.latest_charge : null;
    const chargeId = latestCharge?.id || null;
    const receiptUrl = latestCharge?.receipt_url || null;
    return { receiptUrl, paymentIntentId, chargeId };
  } catch {
    return { receiptUrl: null, paymentIntentId: null, chargeId: null };
  }
};

const findCheckoutSessionByPaymentIntent = async (stripe, paymentIntentId) => {
  if (!stripe || !paymentIntentId) return null;
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: String(paymentIntentId),
      limit: 1,
    });
    return sessions?.data?.[0] || null;
  } catch {
    return null;
  }
};

const resolveCheckoutSessionFromStripeEvent = async (stripe, stripeEvent) => {
  const type = stripeEvent?.type || "";
  const object = stripeEvent?.data?.object || {};

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    return object;
  }

  if (type === "payment_intent.succeeded") {
    const paymentIntentId = typeof object === "string" ? object : object?.id;
    return findCheckoutSessionByPaymentIntent(stripe, paymentIntentId);
  }

  if (type === "charge.succeeded") {
    const paymentIntent = object?.payment_intent;
    const paymentIntentId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id || "";
    return findCheckoutSessionByPaymentIntent(stripe, paymentIntentId);
  }

  return null;
};

const getStripeEventStore = async () => getBlobStore(STRIPE_EVENT_STORE);
const stripeSessionStoreKey = (sessionId) => `session:${String(sessionId || "")}`;

const readStripeEvent = async (eventId) => {
  const store = await getStripeEventStore();
  if (!store) return null;
  return store.get(eventId, { type: "json" });
};

const writeStripeEvent = async (eventId, payload) => {
  const store = await getStripeEventStore();
  if (!store) return false;
  await store.setJSON(eventId, payload);
  return true;
};

const readStripeSessionRecord = async (sessionId) => {
  if (!sessionId) return null;
  const store = await getStripeEventStore();
  if (!store) return null;
  return store.get(stripeSessionStoreKey(sessionId), { type: "json" });
};

const writeStripeSessionRecord = async (sessionId, payload) => {
  if (!sessionId) return false;
  const store = await getStripeEventStore();
  if (!store) return false;
  await store.setJSON(stripeSessionStoreKey(sessionId), payload);
  return true;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const token = `${String(source || "webhook").slice(0, 20)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const claimedAt = Date.now();
  const claimRecord = {
    ...(current || {}),
    sessionId,
    processingToken: token,
    processingSource: source || "stripe-webhook",
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

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isLikelyEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const toEmailCandidates = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,\s;]+/);
  return [value];
};

const uniqueEmails = (values = []) =>
  Array.from(
    new Set(
      values
        .flatMap((entry) => toEmailCandidates(entry))
        .map((entry) => normalizeEmail(entry))
        .filter((entry) => isLikelyEmail(entry))
        .filter(Boolean),
    ),
  );

const getGuestReceiptEmail = (session = {}) =>
  uniqueEmails([
    session?.metadata?.guestEmail,
    session?.metadata?.guest_email,
    session?.metadata?.email,
    session?.customer_email,
    session?.customer_details?.email,
  ])[0] || "";

const getConsentStore = async () => getBlobStore(CONSENT_STORE_NAME);
const getConsentPdfStore = async () => getBlobStore(CONSENT_PDF_STORE_NAME);

const readConsentProof = async (sessionId) => {
  if (!sessionId) return null;
  const store = await getConsentStore();
  if (!store) return null;
  return store.get(sessionId, { type: "json" });
};

const writeConsentPdf = async (token, pdfBytes, metadata = {}) => {
  if (!token || !pdfBytes) return false;
  const store = await getConsentPdfStore();
  if (!store) return false;
  await store.set(token, Buffer.from(pdfBytes), { metadata });
  return true;
};

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

const normalizeProofImage = (value) => {
  if (!value) return { name: "", mime: "", dataUrl: "" };
  if (typeof value === "string") {
    return {
      name: "",
      mime: "",
      dataUrl: value.startsWith("data:image/") ? value.slice(0, 3_000_000) : "",
    };
  }
  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
  return {
    name: sanitizeText(value.name || value.fileName || ""),
    mime: sanitizeText(value.mime || value.type || "", 80),
    dataUrl: dataUrl.startsWith("data:image/") ? dataUrl.slice(0, 3_000_000) : "",
  };
};

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

const buildConsentPdf = async ({ reservationId, metadata, consent }) => {
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

    const sig = toDataUrlBytes(consent?.consentSignatureDataUrl);
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
    const signer = consent?.consentSignerName || metadata?.consent_signer_name || "-";
    const acceptedAt = formatDateTime12h(metadata?.consent_at || consent?.consentAcceptedAt);
    const signerLabel = "SIGNED BY";
    const acceptedLabel = "CONSENT ACCEPTED";
    page.drawText(signerLabel, { x: infoX, y: signatureLabelY - 8, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(signer, font, 11, infoWidth), {
      x: infoX,
      y: signatureLabelY - 24,
      size: 11,
      font,
      color: palette.text,
    });
    page.drawText(acceptedLabel, { x: infoX, y: signatureLabelY - 52, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(acceptedAt, font, 11, infoWidth), {
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

  const guestName =
    [metadata?.guestFirstName, metadata?.guestLastName].filter(Boolean).join(" ") ||
    metadata?.guestName ||
    "-";
  const detailItems = [
    { label: "Generated at", value: formatDateTime12h(new Date()) },
    { label: "Reservation ID", value: reservationId || "-" },
    { label: "Guest", value: guestName },
    { label: "Guest email", value: metadata?.guestEmail || "-" },
    { label: "Check-in", value: metadata?.checkIn || "-" },
    { label: "Check-out", value: metadata?.checkOut || "-" },
    {
      label: "Consent accepted",
      value: formatDateTime12h(metadata?.consent_at || consent?.consentAcceptedAt),
    },
    { label: "Signed by", value: consent?.consentSignerName || metadata?.consent_signer_name || "-" },
    { label: "Stripe session", value: consent?.sessionId || "-" },
    { label: "Payment intent", value: consent?.paymentIntentId || "-" },
    { label: "Receipt URL", value: consent?.receiptUrl || "-" },
  ];
  drawSection("Reservation and Payment Details");
  drawDetailGrid(detailItems);

  drawSection("Consent Statement");
  drawConsentText(metadata?.consent_text || consent?.consentText || "-");

  drawSection("Guest Authorization");
  await drawSignature();

  const verificationEntries = getVerificationEntries(consent?.verification).filter(
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

const normalizeString = (value) => String(value ?? "").trim();

const buildReservationPayload = (session) => {
  const metadata = session.metadata || {};
  const listingId = metadata.listingId;
  const checkIn = metadata.checkIn;
  const checkOut = metadata.checkOut;
  const guests = Number(metadata.guests) || 1;

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const amount =
    toNumber(getStripeSessionPaidAmount(session)) ??
    toNumber(metadata.bd_total) ??
    toNumber(metadata.amount) ??
    0;

  const guestFirstName = metadata.guestFirstName || "";
  const guestLastName = metadata.guestLastName || "";
  const guestName = metadata.guestName || "";
  const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
  const firstName = guestFirstName || nameParts[0] || "Guest";
  const lastName = guestLastName || nameParts.slice(1).join(" ") || "Guest";

  const guest = {
    firstName,
    lastName,
    email: metadata.guestEmail || session.customer_email || "",
    phone: metadata.guestPhone || "",
  };

  const payload = {
    listingId,
    checkInDateLocalized: checkIn,
    checkOutDateLocalized: checkOut,
    status: "confirmed",
    guest,
  };

  const accommodation = toNumber(metadata.bd_accommodation);
  const cleaning = toNumber(metadata.bd_cleaning);
  const taxes = toNumber(metadata.bd_taxes);
  const securityDeposit = toNumber(metadata.bd_security_deposit ?? metadata.security_deposit);
  const vat = toNumber(metadata.bd_vat);
  const cityTax = toNumber(metadata.bd_city_tax);
  const discountAmountRaw = toNumber(metadata.bd_discount);
  const promoDiscountAmountRaw = toNumber(metadata.bd_promo_discount);
  const promoCode = String(metadata.promo_code || "").trim();
  const taxProfile = String(metadata.bd_tax_profile || "").trim().toUpperCase();
  const fees = toNumber(metadata.bd_fees);
  const currency = (metadata.currency || "").toUpperCase();
  const money = {};
  const invoiceItems = [];
  const roundMoney = (value) =>
    Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const discountAmount =
    discountAmountRaw !== null && discountAmountRaw > 0 ? roundMoney(discountAmountRaw) : 0;
  const promoDiscountAmount =
    promoDiscountAmountRaw !== null && promoDiscountAmountRaw > 0 ? roundMoney(promoDiscountAmountRaw) : 0;
  const totalDiscount = (discountAmount || 0) + (promoDiscountAmount || 0);
  const cleaningValue = cleaning !== null ? roundMoney(cleaning) : null;
  const taxesValue = taxes !== null ? roundMoney(taxes) : null;
  const securityDepositValue =
    securityDeposit !== null ? roundMoney(securityDeposit) : null;
  const feesValue = fees !== null ? roundMoney(fees) : null;
  const miscFeesValue =
    feesValue !== null
      ? roundMoney((feesValue || 0) - (securityDepositValue || 0))
      : null;
  const vatValue = vat !== null ? roundMoney(vat) : null;
  const cityTaxValue = cityTax !== null ? roundMoney(cityTax) : null;
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
  let fareAccommodation = accommodation !== null ? roundMoney(accommodation) : null;

  if (fareAccommodation === null && Number.isFinite(amount) && amount >= 0) {
    const nonAccommodation =
      (cleaningValue && cleaningValue > 0 ? cleaningValue : 0) +
      (taxesValue && taxesValue > 0 ? taxesValue : 0) +
      (securityDepositValue && securityDepositValue > 0 ? securityDepositValue : 0) +
      (miscFeesValue && miscFeesValue > 0 ? miscFeesValue : 0);
    fareAccommodation = roundMoney(Math.max(amount - nonAccommodation, 0));
  }
  if (fareAccommodation !== null) {
    money.fareAccommodation = fareAccommodation;
  } else if (Number.isFinite(amount) && amount > 0) {
    money.fareAccommodation = roundMoney(amount);
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
    invoiceItems.push({ title: "Security Deposit", amount: securityDepositValue, normalType: "OTHER" });
  }

  if (
    Number.isFinite(amount) &&
    Number.isFinite(money.fareAccommodation)
  ) {
    const runningTotal =
      (money.fareAccommodation || 0) +
      (Number.isFinite(money.fareCleaning) ? money.fareCleaning : 0) +
      invoiceItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
        0
      );
    const diff = roundMoney(amount - runningTotal);
    if (diff !== null && Math.abs(diff) >= 0.01) {
      money.fareAccommodation = roundMoney(Math.max((money.fareAccommodation || 0) + diff, 0));
    }
  }

  if (invoiceItems.length) {
    money.invoiceItems = invoiceItems;
  }
  if (currency) money.currency = currency;
  if (Object.keys(money).length) payload.money = money;

  return payload;
};

const createMinimalGuestyReservationPayload = ({ listingId, checkIn, checkOut, guests, guest } = {}) => {
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
  const firstName = guest?.firstName || nameParts[0] || "Guest";
  const lastName = guest?.lastName || nameParts.slice(1).join(" ") || "Guest";
  const parsedGuests = Number(guests);
  const normalizedGuests = Number.isFinite(parsedGuests) && parsedGuests > 0 ? Math.round(parsedGuests) : 1;

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
  const parsedAmount = Number(amount);
  const numericAmount = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) / 100 : null;
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
    const isNotFoundOrDenied = Number(err?.statusCode) === 404 || Number(err?.statusCode) === 403;
    if (!isNotFoundOrDenied) throw err;
    return await postOnce(`/reservations/${encodeURIComponent(String(reservationId))}/invoiceItems`, {
      ...body,
      secondIdentifier: safeSecond,
    });
  }
};

const fromStripeAmount = (amount, currency) => {
  if (!Number.isFinite(amount)) return null;
  const normalized = (currency || "USD").toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return amount;
  return amount / 100;
};

const roundMoneyAmount = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

const getStripeSessionPaidAmount = (session) => {
  if (!Number.isFinite(session?.amount_total)) return null;
  const converted = fromStripeAmount(session.amount_total, session?.currency);
  return roundMoneyAmount(converted);
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
  const stripeAmount = getStripeSessionPaidAmount(session);
  const metaTotal =
    Number.isFinite(Number(metadata.bd_total)) ? Number(metadata.bd_total) : null;
  const metaAmount =
    Number.isFinite(Number(metadata.amount)) ? Number(metadata.amount) : null;
  const amount = roundMoneyAmount(stripeAmount ?? metaTotal ?? metaAmount);
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

    const fallback = { ...(payload || {}) };
    delete fallback.guestsCount;
    delete fallback.numberOfGuests;
    return await postOnce(fallback);
  }
};

const guestyRequest = async (path, method, body) => {
  const { token } = await getGuestyToken();
  const response = await fetchWithTimeout(`${OPEN_API_V1}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true };
  }
};

const updateReservationNotes = async (reservationId, notes) => {
  if (!reservationId || !notes) return null;
  const candidates = [
    { path: `/reservations-v3/${reservationId}/notes`, method: "PUT", body: { notes: { other: notes } } },
    { path: `/reservations/${reservationId}/notes`, method: "PUT", body: { notes: { other: notes } } },
    { path: `/reservations/${reservationId}`, method: "PATCH", body: { notes: { other: notes } } },
    { path: `/reservations/${reservationId}`, method: "PATCH", body: { notes } },
  ];

  const errors = [];
  for (const candidate of candidates) {
    try {
      return await guestyRequest(candidate.path, candidate.method, candidate.body);
    } catch (err) {
      errors.push(`${candidate.method} ${candidate.path}: ${err.message}`);
    }
  }

  throw new Error(`Unable to write reservation notes. ${errors.join(" | ")}`);
};

const extractGuestId = (reservation) => {
  return (
    reservation?.guest?._id ||
    reservation?.guest?.id ||
    reservation?.guestId ||
    reservation?.guest_id ||
    reservation?.guests?.[0]?._id ||
    reservation?.guests?.[0]?.id ||
    null
  );
};

const updateGuestNotes = async (guestId, notes) => {
  if (!guestId || !notes) return null;
  const candidates = [
    { path: `/guests/${guestId}`, method: "PATCH", body: { notes } },
    { path: `/guests/${guestId}`, method: "PUT", body: { notes } },
    { path: `/guests/${guestId}/notes`, method: "PUT", body: { notes } },
  ];

  const errors = [];
  for (const candidate of candidates) {
    try {
      return await guestyRequest(candidate.path, candidate.method, candidate.body);
    } catch (err) {
      errors.push(`${candidate.method} ${candidate.path}: ${err.message}`);
    }
  }

  throw new Error(`Unable to write guest notes. ${errors.join(" | ")}`);
};

const sendReceiptEmail = async ({ to, reservationId, metadata, session, proof = {} }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = uniqueEmails([
    ...(Array.isArray(to) ? to : [to]),
    RESERVATIONS_COPY_EMAIL,
  ]);
  if (!apiKey || !from || !recipients.length) {
    const missing = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!from) missing.push("RESEND_FROM_EMAIL");
    if (!recipients.length) missing.push("recipient email");
    return {
      skipped: true,
      reason: `Receipt email skipped due to missing ${missing.join(", ")}.`,
      recipients,
    };
  }

  const total =
    Number.isFinite(Number(metadata?.bd_total))
      ? Number(metadata.bd_total)
      : Number.isFinite(session?.amount_total)
        ? fromStripeAmount(session.amount_total, session?.currency)
        : null;
  const currency = (metadata?.currency || session?.currency || "USD").toUpperCase();
  const formattedTotal =
    Number.isFinite(total) ? `${currency} ${total.toFixed(2)}` : "Paid";

  const checkIn = metadata?.checkIn || "";
  const checkOut = metadata?.checkOut || "";
  const consentAt = metadata?.consent_at || "";
  const consentText = metadata?.consent_text || "";
  const fullName =
    [metadata?.guestFirstName, metadata?.guestLastName].filter(Boolean).join(" ").trim() ||
    metadata?.guestName ||
    "Guest";
  const bccRecipients = uniqueEmails([process.env.RESEND_RECEIPT_BCC || ""]);
  const attachments = [];
  if (proof?.pdfBytes?.length) {
    attachments.push({
      filename: `consent-proof-${reservationId || session?.id || "record"}.pdf`,
      content: Buffer.from(proof.pdfBytes).toString("base64"),
      type: "application/pdf",
    });
  }

  const subject = `OneLuxStay receipt${reservationId ? ` - ${reservationId}` : ""}`;
  const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #2d251f;">
          <h2>Payment receipt</h2>
          <p>Hi ${fullName}, your payment was received successfully.</p>
          ${reservationId ? `<p><strong>Reservation ID:</strong> ${reservationId}</p>` : ""}
          ${checkIn ? `<p><strong>Check-in:</strong> ${checkIn}</p>` : ""}
          ${checkOut ? `<p><strong>Check-out:</strong> ${checkOut}</p>` : ""}
          <p><strong>Total paid:</strong> ${formattedTotal}</p>
          ${consentText ? `<p><strong>Consent:</strong> ${consentText}</p>` : ""}
          ${consentAt ? `<p><strong>Consent accepted at:</strong> ${consentAt}</p>` : ""}
          ${proof?.sessionId ? `<p><strong>Consent proof session:</strong> ${proof.sessionId}</p>` : ""}
          ${proof?.proofUrl ? `<p><strong>Consent proof PDF:</strong> <a href="${proof.proofUrl}" target="_blank" rel="noreferrer">Download PDF</a></p>` : ""}
          ${proof?.receiptUrl ? `<p><strong>Stripe receipt:</strong> <a href="${proof.receiptUrl}" target="_blank" rel="noreferrer">View receipt</a></p>` : ""}
          <p>If you need support, reply to this email.</p>
        </div>
      `;

  const send = async ({
    recipient,
    emailAttachments = attachments,
    emailBcc = bccRecipients,
    timeout = 45000,
  }) =>
    fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipient,
        ...(emailBcc?.length ? { bcc: emailBcc } : {}),
        ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
        subject,
        html,
      }),
    }, timeout);

  const attempts = [
    { name: "full", emailAttachments: attachments, emailBcc: bccRecipients },
    { name: "no_attachments", emailAttachments: [], emailBcc: bccRecipients },
    { name: "no_bcc", emailAttachments: attachments, emailBcc: [] },
    { name: "minimal", emailAttachments: [], emailBcc: [] },
  ];

  const seenAttemptSignatures = new Set();
  let response = null;
  let payload = null;
  let lastSendError = "";

  for (const attempt of attempts) {
    const signature = `${attempt.emailAttachments.length}:${attempt.emailBcc.join(",")}`;
    if (seenAttemptSignatures.has(signature)) continue;
    seenAttemptSignatures.add(signature);
    try {
      response = await send({
        recipient: recipients,
        emailAttachments: attempt.emailAttachments,
        emailBcc: attempt.emailBcc,
      });
      payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return { ...payload, recipients };
      }
      lastSendError = payload?.message || `Unable to send receipt email (${attempt.name}).`;
    } catch (err) {
      lastSendError = err?.message || `Unable to send receipt email (${attempt.name}).`;
    }
  }

  if (!response?.ok) {
    const fallbackTo = uniqueEmails([process.env.RESEND_FALLBACK_TO || ""]);
    if (fallbackTo.length) {
      const originalRecipients = recipients.join(", ");
      const fallbackHtml = `${html}<p><strong>Original intended recipient:</strong> ${originalRecipients}</p>`;
      try {
        response = await fetchWithTimeout("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: fallbackTo,
            subject: `[Fallback] ${subject}`,
            html: `${fallbackHtml}<p><strong>Original intended recipient(s):</strong> ${originalRecipients}</p>`,
          }),
        }, 30000);
        payload = await response.json().catch(() => ({}));
      } catch (err) {
        lastSendError = err?.message || "Unable to send fallback receipt email.";
      }
    }
    if (!response?.ok) {
      throw new Error(
        payload?.message ||
          lastSendError ||
          "Unable to send receipt email."
      );
    }
  }
  return { ...payload, recipients };
};

const buildReservationNotes = (metadata, proof = {}) => {
  const notes = [];
  const accommodation = Number(metadata.bd_accommodation);
  const discountAmount = Number(metadata.bd_discount);
  const discountRateRaw = Number(metadata.bd_discount_rate);
  if (Number.isFinite(discountAmount) && discountAmount > 0) {
    const baseForPercent =
      Number.isFinite(accommodation) && accommodation + discountAmount > 0
        ? accommodation + discountAmount
        : null;
    const percentFromAmount =
      baseForPercent && baseForPercent > 0
        ? Math.round((discountAmount / baseForPercent) * 100)
        : null;
    const discountPercent =
      Number.isFinite(discountRateRaw) && discountRateRaw > 0
        ? Math.round(discountRateRaw * 100)
        : percentFromAmount || 10;
    notes.push(
      `Website booking discount (${discountPercent}%) applied via OneLuxStay website.`
    );
  }

  if (metadata.consent_text) {
    const consentAt = metadata.consent_at
      ? ` Accepted at ${metadata.consent_at}.`
      : "";
    notes.push(`Consent: ${metadata.consent_text}.${consentAt}`.replace(/\.\./g, "."));
  }
  if (metadata.consent_signer_name) {
    notes.push(`Signed by: ${metadata.consent_signer_name}.`);
  }
  if (proof?.sessionId) {
    notes.push(`Consent proof session: ${proof.sessionId}.`);
  }
  if (proof?.paymentIntentId) {
    notes.push(`Stripe payment intent: ${proof.paymentIntentId}.`);
  }
  if (proof?.receiptUrl) {
    notes.push(`Stripe receipt: ${proof.receiptUrl}`);
  }
  if (proof?.proofUrl) {
    notes.push(`Consent proof PDF: ${proof.proofUrl}`);
  }

  return notes.length ? notes.join(" ") : null;
};

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const signature = getHeaderValue(event, "stripe-signature").trim();
  if (!signature) {
    return jsonResponse(400, { message: "Missing Stripe signature" });
  }

  const hasRawBody = typeof event?.rawBody === "string";
  const hasStringBody = typeof event?.body === "string";
  if (!hasRawBody && !hasStringBody) {
    return jsonResponse(400, {
      message: "Missing raw request body for Stripe signature verification",
    });
  }

  const rawBody = hasRawBody
    ? event.rawBody
    : event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

  let stripeEvent;
  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    return jsonResponse(500, { message: err?.message || "Stripe client is not configured" });
  }

  const webhookSecrets = parseWebhookSecrets();
  if (!webhookSecrets.length) {
    return jsonResponse(500, {
      message:
        "Missing webhook secret. Set STRIPE_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SECRETS).",
    });
  }

  let verificationError = null;
  for (const webhookSecret of webhookSecrets) {
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      verificationError = null;
      break;
    } catch (err) {
      verificationError = err;
    }
  }

  if (!stripeEvent) {
    return jsonResponse(400, {
      message: "Invalid webhook signature",
      error: verificationError?.message || "Signature verification failed",
      candidateSecrets: webhookSecrets.length,
    });
  }

  const handledTypes = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "payment_intent.succeeded",
    "charge.succeeded",
  ]);
  if (!handledTypes.has(stripeEvent.type)) {
    return jsonResponse(200, { received: true });
  }

  const session = await resolveCheckoutSessionFromStripeEvent(stripe, stripeEvent);
  if (!session?.id) {
    return jsonResponse(200, {
      received: true,
      ignored: true,
      reason: "No checkout session could be resolved from event",
      type: stripeEvent.type,
    });
  }

  let existing = await readStripeEvent(stripeEvent.id);
  if (existing) {
    if (existing?.paymentError && existing?.reservationId) {
      const retryAt = Date.now();
      const paymentRetryCount = Number(existing?.paymentRetryCount || 0) + 1;
      let paymentRetryError = null;
      let paymentPostedAmount = existing?.paymentPostedAmount ?? null;
      try {
        await createReservationPayment(existing.reservationId, session);
        paymentPostedAmount =
          getStripeSessionPaidAmount(session) ??
          (Number.isFinite(Number(paymentPostedAmount)) ? Number(paymentPostedAmount) : null);
      } catch (err) {
        paymentRetryError = err?.message || "Unable to record payment in Guesty.";
      }

      const retryPayload = {
        ...existing,
        paymentRetryCount,
        paymentRetriedAt: retryAt,
        paymentError: paymentRetryError,
        ...(paymentRetryError
          ? {}
          : {
              paymentRecordedAt: retryAt,
              paymentPostedAmount,
            }),
      };
      await writeStripeEvent(stripeEvent.id, retryPayload);
      await writeStripeSessionRecord(session?.id || existing?.sessionId || "", retryPayload);
      existing = retryPayload;

      if (paymentRetryError) {
        return jsonResponse(500, {
          received: true,
          duplicate: true,
          retryable: true,
          paymentError: paymentRetryError,
        });
      }
    }

    if (existing?.emailError) {
      const proof = await getSessionReceiptDetails(session);
      const retryAt = Date.now();
      const emailRetryCount = Number(existing?.emailRetryCount || 0) + 1;
      let emailRetryError = null;
      const guestReceiptEmail = getGuestReceiptEmail(session);
      try {
        const emailResult = await sendReceiptEmail({
          to: [guestReceiptEmail],
          reservationId: existing?.reservationId || null,
          metadata: session?.metadata || {},
          session,
          proof: {
            sessionId: session?.id || existing?.sessionId || null,
            proofUrl: existing?.consentPdfUrl || null,
            receiptUrl: proof?.receiptUrl || existing?.receiptUrl || null,
          },
        });
        if (emailResult?.skipped) {
          emailRetryError =
            emailResult?.reason ||
            "Receipt email skipped due to missing email configuration or recipient.";
        }
      } catch (err) {
        emailRetryError = err?.message || "Unable to send receipt email.";
      }

      const retryPayload = {
        ...existing,
        emailRetryCount,
        emailRetriedAt: retryAt,
        emailError: emailRetryError,
        ...(emailRetryError ? {} : { emailSentAt: retryAt }),
        guestReceiptEmail,
        receiptUrl: proof?.receiptUrl || existing?.receiptUrl || null,
        paymentIntentId: proof?.paymentIntentId || existing?.paymentIntentId || null,
      };
      await writeStripeEvent(stripeEvent.id, retryPayload);
      await writeStripeSessionRecord(session?.id || existing?.sessionId || "", retryPayload);

      if (emailRetryError) {
        return jsonResponse(500, {
          received: true,
          duplicate: true,
          retryable: true,
          emailError: emailRetryError,
        });
      }

      return jsonResponse(200, {
        received: true,
        duplicate: true,
        emailRetried: true,
      });
    }
    return jsonResponse(200, { received: true, duplicate: true });
  }

  let existingSession = await readStripeSessionRecord(session.id);
  if (
    existingSession &&
    !existingSession?.reservationId &&
    !existingSession?.processedAt &&
    Number(existingSession?.processingAt || 0) &&
    Date.now() - Number(existingSession?.processingAt || 0) < STRIPE_SESSION_PROCESSING_STALE_MS
  ) {
    const waited = await waitForStripeSessionReservation(session.id);
    if (waited) existingSession = waited;
  }
  if (existingSession?.reservationId || existingSession?.processedAt) {
    if (existingSession?.paymentError && existingSession?.reservationId) {
      const retryAt = Date.now();
      const paymentRetryCount = Number(existingSession?.paymentRetryCount || 0) + 1;
      let paymentRetryError = null;
      let paymentPostedAmount = existingSession?.paymentPostedAmount ?? null;
      try {
        await createReservationPayment(existingSession.reservationId, session);
        paymentPostedAmount =
          getStripeSessionPaidAmount(session) ??
          (Number.isFinite(Number(paymentPostedAmount)) ? Number(paymentPostedAmount) : null);
      } catch (err) {
        paymentRetryError = err?.message || "Unable to record payment in Guesty.";
      }

      const retryPayload = {
        ...existingSession,
        paymentRetryCount,
        paymentRetriedAt: retryAt,
        paymentError: paymentRetryError,
        ...(paymentRetryError
          ? {}
          : {
              paymentRecordedAt: retryAt,
              paymentPostedAmount,
            }),
      };
      await writeStripeSessionRecord(session?.id || "", retryPayload);
      await writeStripeEvent(stripeEvent.id, {
        ...retryPayload,
        replayedByEventId: stripeEvent.id,
        replayedAt: retryAt,
        duplicateSession: true,
      });
      existingSession = retryPayload;

      if (paymentRetryError) {
        return jsonResponse(500, {
          received: true,
          duplicate: true,
          duplicateSession: true,
          retryable: true,
          sessionId: session.id,
          paymentError: paymentRetryError,
        });
      }
    }

    if (existingSession?.emailError) {
      const proof = await getSessionReceiptDetails(session);
      const retryAt = Date.now();
      const emailRetryCount = Number(existingSession?.emailRetryCount || 0) + 1;
      let emailRetryError = null;
      const guestReceiptEmail = getGuestReceiptEmail(session);
      try {
        const emailResult = await sendReceiptEmail({
          to: [guestReceiptEmail],
          reservationId: existingSession?.reservationId || null,
          metadata: session?.metadata || {},
          session,
          proof: {
            sessionId: session?.id || existingSession?.sessionId || null,
            proofUrl: existingSession?.consentPdfUrl || null,
            receiptUrl: proof?.receiptUrl || existingSession?.receiptUrl || null,
          },
        });
        if (emailResult?.skipped) {
          emailRetryError =
            emailResult?.reason ||
            "Receipt email skipped due to missing email configuration or recipient.";
        }
      } catch (err) {
        emailRetryError = err?.message || "Unable to send receipt email.";
      }

      const retryPayload = {
        ...existingSession,
        emailRetryCount,
        emailRetriedAt: retryAt,
        emailError: emailRetryError,
        ...(emailRetryError ? {} : { emailSentAt: retryAt }),
        guestReceiptEmail,
        receiptUrl: proof?.receiptUrl || existingSession?.receiptUrl || null,
        paymentIntentId: proof?.paymentIntentId || existingSession?.paymentIntentId || null,
      };
      await writeStripeSessionRecord(session?.id || "", retryPayload);
      await writeStripeEvent(stripeEvent.id, {
        ...retryPayload,
        replayedByEventId: stripeEvent.id,
        replayedAt: retryAt,
        duplicateSession: true,
      });

      if (emailRetryError) {
        return jsonResponse(500, {
          received: true,
          duplicate: true,
          duplicateSession: true,
          retryable: true,
          sessionId: session.id,
          emailError: emailRetryError,
        });
      }

      return jsonResponse(200, {
        received: true,
        duplicate: true,
        duplicateSession: true,
        emailRetried: true,
        sessionId: session.id,
      });
    }

    await writeStripeEvent(stripeEvent.id, {
      ...existingSession,
      replayedByEventId: stripeEvent.id,
      replayedAt: Date.now(),
      duplicateSession: true,
    });
    return jsonResponse(200, {
      received: true,
      duplicate: true,
      duplicateSession: true,
      sessionId: session.id,
    });
  }

  if (session.payment_status && session.payment_status !== "paid") {
    return jsonResponse(200, { received: true, unpaid: true });
  }

  const claim = await claimStripeSessionProcessing(session.id, "stripe-webhook");
  if (!claim.claimed) {
    const finalRecord = claim.record?.reservationId
      ? claim.record
      : await waitForStripeSessionReservation(session.id);
    if (finalRecord?.reservationId || finalRecord?.processedAt) {
      await writeStripeEvent(stripeEvent.id, {
        ...finalRecord,
        replayedByEventId: stripeEvent.id,
        replayedAt: Date.now(),
        duplicateSession: true,
      });
      return jsonResponse(200, {
        received: true,
        duplicate: true,
        duplicateSession: true,
        sessionId: session.id,
      });
    }
    return jsonResponse(500, {
      message: "Reservation processing lock conflict; retrying via webhook retries.",
      received: true,
      retryable: true,
      sessionId: session.id,
      reason: claim.reason || "processing-lock-conflict",
    });
  }

  try {
    const metadata = session?.metadata || {};
    const listingId = metadata.listingId;
    const checkIn = metadata.checkIn;
    const checkOut = metadata.checkOut;
    const guests = Number(metadata.guests) || 1;
    const quoteId = normalizeString(metadata.quote_id || metadata.quoteId || "");

    const guestFirstName = metadata.guestFirstName || "";
    const guestLastName = metadata.guestLastName || "";
    const guestName = metadata.guestName || "";
    const nameParts = guestName ? guestName.trim().split(/\s+/) : [];
    const guest = {
      firstName: guestFirstName || nameParts[0] || "Guest",
      lastName: guestLastName || nameParts.slice(1).join(" ") || "Guest",
      email: metadata.guestEmail || session.customer_email || "",
      phone: metadata.guestPhone || "",
    };

    if (!listingId || !checkIn || !checkOut) {
      return jsonResponse(400, { message: "Missing reservation metadata" });
    }

    let reservation = null;
    if (quoteId) {
      try {
        reservation = await createGuestyReservationFromQuote({ quoteId, guest, status: "confirmed" });
      } catch (err) {
        console.warn("[stripe-webhook] Reservation-from-quote failed; falling back to minimal create.", {
          sessionId: session.id,
          quoteId,
          error: err?.message || String(err),
        });
        reservation = null;
      }
    }

    if (!reservation) {
      const minimal = createMinimalGuestyReservationPayload({
        listingId,
        checkIn,
        checkOut,
        guests,
        guest,
      });
      reservation = await createGuestyReservation(minimal);
    }

    const reservationId = reservation?._id || reservation?.id || null;
    const guestId = extractGuestId(reservation);

    const securityDepositAmount = Number(metadata.bd_security_deposit ?? metadata.security_deposit);
    if (reservationId && Number.isFinite(securityDepositAmount) && securityDepositAmount > 0) {
      try {
        await createGuestyInvoiceItem(reservationId, {
          title: "Security Deposit",
          amount: securityDepositAmount,
          normalType: "AFE",
          secondIdentifier: "DEPOSIT",
          description: "Security deposit collected via OneLuxStay website checkout.",
        });
      } catch (err) {
        console.warn("[stripe-webhook] Unable to add security deposit invoice item in Guesty.", {
          reservationId,
          sessionId: session.id,
          error: err?.message || String(err),
        });
      }
    }

    await writeStripeSessionRecord(session?.id || "", {
      ...(existingSession || {}),
      sessionId: session?.id || null,
      reservationId,
      guestId,
      listingId,
      reservationCreatedAt: Date.now(),
      source: "stripe-webhook",
      sourceEventId: stripeEvent.id,
      processingToken: claim.token || null,
      processingSource: "stripe-webhook",
      processingAt: claim.record?.processingAt || Date.now(),
      processingUpdatedAt: Date.now(),
    });
    const proof = await getSessionReceiptDetails(session);
    const consentPayload = await readConsentProof(session?.id || "");
    let consentPdfError = null;
    let consentPdfToken = null;
    let consentPdfUrl = null;
    let consentPdfBytes = null;
    try {
      consentPdfBytes = await buildConsentPdf({
        reservationId,
        metadata: session?.metadata || {},
        consent: {
          ...(consentPayload || {}),
          sessionId: session?.id || null,
          paymentIntentId: proof?.paymentIntentId || null,
          receiptUrl: proof?.receiptUrl || null,
        },
      });
      consentPdfToken = crypto.randomUUID().replace(/-/g, "");
      const stored = await writeConsentPdf(consentPdfToken, consentPdfBytes, {
        reservationId: reservationId || "",
        sessionId: session?.id || "",
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
      consentPdfError = consentPdfError || err.message;
    }
    const noteText = buildReservationNotes(session.metadata || {}, {
      sessionId: session?.id || null,
      paymentIntentId: proof?.paymentIntentId || null,
      receiptUrl: proof?.receiptUrl || null,
      proofUrl: consentPdfUrl,
    });
    let paymentError = null;
    let paymentRecordedAt = null;
    let paymentPostedAmount = null;
    try {
      await createReservationPayment(reservationId, session);
      paymentRecordedAt = Date.now();
      paymentPostedAmount = getStripeSessionPaidAmount(session);
    } catch (err) {
      paymentError = err.message;
      console.error("[stripe-webhook] Payment record failed", {
        reservationId,
        sessionId: session?.id,
        error: paymentError,
      });
    }
    let noteError = null;
    if (noteText && reservationId) {
      try {
        await updateReservationNotes(reservationId, noteText);
      } catch (err) {
        noteError = err.message;
      }
    }
    let guestNoteError = null;
    if (noteText && guestId) {
      try {
        await updateGuestNotes(guestId, noteText);
      } catch (err) {
        guestNoteError = err.message;
      }
    }
    let emailError = null;
    let emailSentAt = null;
    const guestReceiptEmail = getGuestReceiptEmail(session);
    let emailRecipients = [];
    try {
      const emailResult = await sendReceiptEmail({
        to: [guestReceiptEmail],
        reservationId,
        metadata: session?.metadata || {},
        session,
        proof: {
          sessionId: session?.id || null,
          proofUrl: consentPdfUrl,
          receiptUrl: proof?.receiptUrl || null,
          pdfBytes: consentPdfBytes,
        },
      });
      if (emailResult?.skipped) {
        emailError =
          emailResult?.reason ||
          "Receipt email skipped due to missing email configuration or recipient.";
      } else {
        emailSentAt = Date.now();
      }
      emailRecipients = Array.isArray(emailResult?.recipients)
        ? emailResult.recipients
        : [];
    } catch (err) {
      emailError = err.message;
    }
    const processedPayload = {
      processedAt: Date.now(),
      reservationId,
      guestId,
      listingId,
      sessionId: session?.id || null,
      paymentIntentId: proof?.paymentIntentId || null,
      receiptUrl: proof?.receiptUrl || null,
      consentPdfUrl,
      consentPdfError,
      paymentError,
      ...(paymentRecordedAt ? { paymentRecordedAt } : {}),
      ...(Number.isFinite(Number(paymentPostedAmount))
        ? { paymentPostedAmount: Number(paymentPostedAmount) }
        : {}),
      paymentRetryCount: Number(existingSession?.paymentRetryCount || 0),
      noteError,
      guestNoteError,
      guestReceiptEmail,
      emailRecipients,
      emailRetryCount: 0,
      emailError,
      ...(emailSentAt ? { emailSentAt } : {}),
    };
    const stored = await writeStripeEvent(stripeEvent.id, processedPayload);
    await writeStripeSessionRecord(session?.id || "", {
      ...processedPayload,
      sourceEventId: stripeEvent.id,
    });
    if (paymentError && stored) {
      return jsonResponse(500, {
        message: "Guesty payment sync failed; retrying via Stripe webhook retries.",
        received: true,
        retryable: true,
        reservationId,
        paymentError,
        noteError,
        guestNoteError,
        consentPdfUrl,
        consentPdfError,
      });
    }
    if (paymentError && !stored) {
      console.error(
        "[stripe-webhook] Payment sync failed, but webhook event storage is unavailable",
        {
          eventId: stripeEvent.id,
          reservationId,
          paymentError,
        }
      );
    }
    if (emailError && stored) {
      return jsonResponse(500, {
        message: "Receipt delivery failed; retry scheduled via Stripe webhook retries.",
        received: true,
        retryable: true,
        reservationId,
        emailError,
        paymentError,
        noteError,
        guestNoteError,
        consentPdfUrl,
        consentPdfError,
      });
    }
    if (emailError && !stored) {
      console.error("[stripe-webhook] Receipt delivery failed, but webhook event storage is unavailable", {
        eventId: stripeEvent.id,
        reservationId,
        emailError,
      });
    }
    return jsonResponse(200, {
      received: true,
      reservationId,
      paymentError,
      noteError,
      guestNoteError,
      emailError,
      consentPdfUrl,
      consentPdfError,
    });
  } catch (err) {
    await writeStripeSessionRecord(session?.id || "", {
      ...(existingSession || {}),
      sessionId: session?.id || null,
      source: "stripe-webhook",
      sourceEventId: stripeEvent.id,
      processingToken: null,
      processingSource: "stripe-webhook",
      processingAt: 0,
      processingUpdatedAt: Date.now(),
      processingError: err?.message || "Guesty reservation failed",
    });
    return jsonResponse(502, { message: "Guesty reservation failed", error: err.message });
  }
}
