import Stripe from "stripe";
import { getStore } from "@netlify/blobs";
import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";
const STRIPE_EVENT_STORE = "stripe-webhook-events";
const CONSENT_STORE_NAME = "consent-proofs";
const CONSENT_PDF_STORE_NAME = "consent-proof-pdfs";
const RESERVATIONS_COPY_EMAIL = "reservations@oneluxstay.com";
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
  const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
  const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;
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

const getStripeEventStore = async () => getBlobStore(STRIPE_EVENT_STORE);

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

const buildConsentPdf = async ({ reservationId, metadata, consent }) => {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.2, 0.16, 0.12);
  let y = 760;

  const drawLine = (label, value, bold = false) => {
    const safeValue = value || "-";
    page.drawText(`${label}: ${safeValue}`, {
      x: 52,
      y,
      size: 11,
      font: bold ? fontBold : font,
      color,
    });
    y -= 20;
  };
  const addPage = () => {
    page = pdfDoc.addPage([612, 792]);
    y = 760;
  };
  const ensureSpace = (requiredHeight) => {
    if (y - requiredHeight < 48) addPage();
  };

  page.drawText("OneLuxStay Consent Proof", {
    x: 52,
    y,
    size: 20,
    font: fontBold,
    color,
  });
  y -= 30;
  drawLine("Generated at", new Date().toISOString());
  drawLine("Reservation ID", reservationId || "-");
  drawLine("Guest", [metadata?.guestFirstName, metadata?.guestLastName].filter(Boolean).join(" ") || metadata?.guestName || "-");
  drawLine("Guest email", metadata?.guestEmail || "-");
  drawLine("Check-in", metadata?.checkIn || "-");
  drawLine("Check-out", metadata?.checkOut || "-");
  drawLine("Consent accepted at", metadata?.consent_at || consent?.consentAcceptedAt || "-");
  drawLine("Signed by", consent?.consentSignerName || metadata?.consent_signer_name || "-", true);
  drawLine("Stripe session", consent?.sessionId || "-");
  drawLine("Stripe payment intent", consent?.paymentIntentId || "-");
  drawLine("Stripe receipt", consent?.receiptUrl || "-");
  y -= 6;
  page.drawText("Consent text:", { x: 52, y, size: 11, font: fontBold, color });
  y -= 18;

  const consentText = metadata?.consent_text || consent?.consentText || "-";
  const words = consentText.split(/\s+/);
  let line = "";
  const maxWidth = 500;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    const w = font.widthOfTextAtSize(next, 10);
    if (w > maxWidth) {
      page.drawText(line, { x: 52, y, size: 10, font, color });
      y -= 14;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    page.drawText(line, { x: 52, y, size: 10, font, color });
    y -= 22;
  }

  ensureSpace(130);
  page.drawText("Guest signature:", { x: 52, y, size: 11, font: fontBold, color });
  y -= 12;

  const sig = toDataUrlBytes(consent?.consentSignatureDataUrl);
  if (sig && y > 110) {
    try {
      const embedded = sig.mime.includes("png")
        ? await pdfDoc.embedPng(sig.bytes)
        : await pdfDoc.embedJpg(sig.bytes);
      const dims = embedded.scale(0.35);
      page.drawRectangle({ x: 52, y: y - 82, width: 250, height: 84, borderColor: rgb(0.75, 0.7, 0.62), borderWidth: 1 });
      page.drawImage(embedded, { x: 58, y: y - 76, width: Math.min(238, dims.width), height: Math.min(72, dims.height) });
      y -= 94;
    } catch {
      page.drawText("Signature image unavailable", { x: 52, y, size: 10, font, color });
      y -= 16;
    }
  } else {
    page.drawText("No signature image captured", { x: 52, y, size: 10, font, color });
    y -= 16;
  }

  const verificationEntries = getVerificationEntries(consent?.verification).filter(
    (item) => item?.dataUrl || item?.name,
  );
  if (verificationEntries.length) {
    ensureSpace(34);
    page.drawText("Verification uploads:", { x: 52, y, size: 11, font: fontBold, color });
    y -= 18;
    for (const entry of verificationEntries) {
      ensureSpace(170);
      const labelText = entry.name
        ? `${entry.label}: ${sanitizeText(entry.name, 72)}`
        : `${entry.label}:`;
      page.drawText(labelText, { x: 52, y, size: 10, font: fontBold, color });
      y -= 14;

      const imageData = toDataUrlBytes(entry.dataUrl);
      if (imageData) {
        try {
          const embeddedImage = imageData.mime.includes("png")
            ? await pdfDoc.embedPng(imageData.bytes)
            : await pdfDoc.embedJpg(imageData.bytes);
          const fitted = scaleToFit(embeddedImage.width, embeddedImage.height, 236, 128);
          page.drawRectangle({
            x: 52,
            y: y - 136,
            width: 248,
            height: 136,
            borderColor: rgb(0.75, 0.7, 0.62),
            borderWidth: 1,
          });
          page.drawImage(embeddedImage, {
            x: 58 + Math.max(0, (236 - fitted.width) / 2),
            y: y - 132 + Math.max(0, (128 - fitted.height) / 2),
            width: fitted.width,
            height: fitted.height,
          });
          y -= 146;
          continue;
        } catch {
          // fall through to text fallback
        }
      }

      const fallbackText = entry.name
        ? "Preview unavailable for this uploaded file."
        : "No preview image captured.";
      page.drawText(fallbackText, { x: 52, y, size: 10, font, color });
      y -= 22;
    }
  }

  return pdfDoc.save();
};

const buildReservationPayload = (session) => {
  const metadata = session.metadata || {};
  const listingId = metadata.listingId;
  const checkIn = metadata.checkIn;
  const checkOut = metadata.checkOut;
  const guests = Number(metadata.guests) || 1;
  const amount = Number(metadata.amount || 0);

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

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
  const discountAmount = toNumber(metadata.bd_discount);
  const discountRateRaw = toNumber(metadata.bd_discount_rate);
  const cleaning = toNumber(metadata.bd_cleaning);
  const fees = toNumber(metadata.bd_fees);
  const currency = (metadata.currency || "").toUpperCase();
  const money = {};

  if (accommodation !== null) {
    money.fareAccommodation = accommodation;
  } else if (Number.isFinite(amount) && amount > 0) {
    money.fareAccommodation = amount;
  }

  if (cleaning !== null) money.fareCleaning = cleaning;
  if (currency) money.currency = currency;

  const invoiceItems = [];
  if (fees !== null && fees > 0) {
    invoiceItems.push({ title: "Fees", amount: fees, normalType: "OTHER" });
  }
  if (invoiceItems.length) money.invoiceItems = invoiceItems;
  if (Object.keys(money).length) payload.money = money;

  return payload;
};

const fromStripeAmount = (amount, currency) => {
  if (!Number.isFinite(amount)) return null;
  const normalized = (currency || "USD").toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return amount;
  return amount / 100;
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
  const metaTotal =
    Number.isFinite(Number(metadata.bd_total)) ? Number(metadata.bd_total) : null;
  const metaAmount =
    Number.isFinite(Number(metadata.amount)) ? Number(metadata.amount) : null;
  const stripeAmount =
    Number.isFinite(session?.amount_total)
      ? fromStripeAmount(session.amount_total, session?.currency)
      : null;
  const amount = metaTotal ?? metaAmount ?? stripeAmount;
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
  const response = await fetchWithTimeout(`${OPEN_API_V1}/reservations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
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
  const recipients = Array.from(
    new Set([...(Array.isArray(to) ? to : [to]), RESERVATIONS_COPY_EMAIL].filter(Boolean)),
  );
  if (!apiKey || !from || !recipients.length) return { skipped: true };

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
  const bcc = process.env.RESEND_RECEIPT_BCC || "";
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

  const send = async (recipient) =>
    fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipient,
        ...(bcc ? { bcc } : {}),
        ...(attachments.length ? { attachments } : {}),
        subject,
        html,
      }),
    });

  let response = await send(recipients);

  let payload = await response.json();
  if (!response.ok) {
    const fallbackTo = process.env.RESEND_FALLBACK_TO || "";
    if (fallbackTo) {
      const originalRecipients = Array.isArray(to) ? to.join(", ") : String(to || "");
      const fallbackHtml = `${html}<p><strong>Original intended recipient:</strong> ${originalRecipients}</p>`;
      response = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: fallbackTo,
          ...(attachments.length ? { attachments } : {}),
          subject: `[Fallback] ${subject}`,
          html: `${fallbackHtml}<p><strong>Original intended recipient(s):</strong> ${originalRecipients}</p>`,
        }),
      });
      payload = await response.json();
    }
    if (!response.ok) {
      throw new Error(payload.message || "Unable to send receipt email.");
    }
  }
  return payload;
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

  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!signature) {
    return jsonResponse(400, { message: "Missing Stripe signature" });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  let stripeEvent;
  try {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return jsonResponse(400, { message: "Invalid webhook signature", error: err.message });
  }

  const handledTypes = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]);
  if (!handledTypes.has(stripeEvent.type)) {
    return jsonResponse(200, { received: true });
  }

  const existing = await readStripeEvent(stripeEvent.id);
  if (existing) {
    return jsonResponse(200, { received: true, duplicate: true });
  }

  const session = stripeEvent.data.object;
  if (session.payment_status && session.payment_status !== "paid") {
    return jsonResponse(200, { received: true, unpaid: true });
  }

  const payload = buildReservationPayload(session);
  if (!payload.listingId || !payload.checkInDateLocalized || !payload.checkOutDateLocalized) {
    return jsonResponse(400, { message: "Missing reservation metadata" });
  }

  try {
    const reservation = await createGuestyReservation(payload);
    const reservationId = reservation?._id || reservation?.id || null;
    const guestId = extractGuestId(reservation);
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
    try {
      await createReservationPayment(reservationId, session);
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
    try {
      await sendReceiptEmail({
        to: [session?.metadata?.guestEmail || session?.customer_email || ""],
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
    } catch (err) {
      emailError = err.message;
    }
    await writeStripeEvent(stripeEvent.id, {
      processedAt: Date.now(),
      reservationId,
      guestId,
      listingId: payload.listingId,
      sessionId: session?.id || null,
      paymentIntentId: proof?.paymentIntentId || null,
      receiptUrl: proof?.receiptUrl || null,
      consentPdfUrl,
      consentPdfError,
      paymentError,
      noteError,
      guestNoteError,
      emailError,
    });
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
    return jsonResponse(502, { message: "Guesty reservation failed", error: err.message });
  }
}
