import Stripe from "stripe";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";
const CONSENT_STORE_NAME = "consent-proofs";
const CONSENT_PDF_STORE_NAME = "consent-proof-pdfs";
const RESERVATIONS_COPY_EMAIL = "reservations@oneluxstay.com";

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
  drawLine("Confirmation ID", confirmationId || "-");
  drawLine("Reservation ID", reservationId || "-");
  drawLine("Listing", listingTitle || "-");
  drawLine("Guest", guestName || "-");
  drawLine("Guest email", guestEmail || "-");
  drawLine("Check-in", checkIn || "-");
  drawLine("Check-out", checkOut || "-");
  drawLine("Guests", Number.isFinite(Number(guests)) ? String(Number(guests)) : "-");
  drawLine("Total charged", formatCurrencyValue(amount, currency));
  drawLine("Consent accepted at", consentAcceptedAt || "-");
  drawLine("Signed by", consentSignerName || "-", true);
  y -= 6;
  page.drawText("Consent text:", { x: 52, y, size: 11, font: fontBold, color });
  y -= 18;

  const text = consentText || "-";
  const words = String(text).split(/\s+/);
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
  const sig = toDataUrlBytes(consentSignatureDataUrl);
  if (sig && y > 110) {
    try {
      const embedded = sig.mime.includes("png")
        ? await pdfDoc.embedPng(sig.bytes)
        : await pdfDoc.embedJpg(sig.bytes);
      const dims = embedded.scale(0.35);
      page.drawRectangle({
        x: 52,
        y: y - 82,
        width: 250,
        height: 84,
        borderColor: rgb(0.75, 0.7, 0.62),
        borderWidth: 1,
      });
      page.drawImage(embedded, {
        x: 58,
        y: y - 76,
        width: Math.min(238, dims.width),
        height: Math.min(72, dims.height),
      });
      y -= 96;
    } catch {
      page.drawText("Signature image unavailable", { x: 52, y, size: 10, font, color });
      y -= 16;
    }
  } else {
    page.drawText("No signature image captured", { x: 52, y, size: 10, font, color });
    y -= 16;
  }

  const verificationEntries = getVerificationEntries(verification).filter(
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
          // fall through to non-image note
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

let stripeClient;
const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
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

const writeConsentPdf = async (token, pdfBytes, metadata = {}) => {
  if (!token || !pdfBytes) return false;
  const store = await getBlobStore(CONSENT_PDF_STORE_NAME);
  if (!store) return false;
  await store.set(token, Buffer.from(pdfBytes), { metadata });
  return true;
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
  const money = {};
  if (Number.isFinite(accommodation)) {
    money.fareAccommodation = accommodation;
  } else if (Number.isFinite(amount) && amount > 0) {
    money.fareAccommodation = amount;
  }
  if (Number.isFinite(cleaning)) {
    money.fareCleaning = cleaning;
  }
  if (Number.isFinite(fees) && fees > 0) {
    money.invoiceItems = [{ title: "Fees", amount: fees, normalType: "OTHER" }];
  }
  if (currency) {
    money.currency = String(currency).toUpperCase();
  }
  if (Object.keys(money).length) {
    payload.money = money;
  }

  return payload;
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
  const { ids = "", startDate = "", endDate = "" } = event.queryStringParameters || {};
  if (!ids || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing ids, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds: ids,
    startDate,
    endDate,
    includeAllotment: "true",
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
    ignoreInactiveChildAllotment = "false",
    ignoreUnlistedChildAllotment = "false",
  } = event.queryStringParameters || {};

  if (!listingIds || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing listingIds, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds,
    startDate,
    endDate,
    includeAllotment,
    ignoreInactiveChildAllotment,
    ignoreUnlistedChildAllotment,
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
  const { startDate, endDate, months = "1" } = event.queryStringParameters || {};
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
    if (key) acc[key] = item;
    return acc;
  }, {});

  return jsonResponse(200, { results, errors: payload?.errors || [], tokenSource });
};

const handleFreeCheckout = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const {
    listingId,
    listingTitle,
    checkIn,
    checkOut,
    guests,
    amount,
    currency,
    breakdown,
    promoCode,
    promoDiscountAmount,
    promoDiscountRate,
    guest,
    consentText,
    consentAcceptedAt,
    consentSignerName,
    consentSignatureDataUrl,
    verification,
  } = body || {};

  if (!listingId || !checkIn || !checkOut || amount == null) {
    return jsonResponse(400, { message: "Missing listingId, dates, or amount" });
  }

  if (!guest?.email) {
    return jsonResponse(400, { message: "Guest email is required" });
  }

  const breakdownTotal = breakdown && typeof breakdown === "object"
    ? Number(breakdown.total ?? breakdown.subtotal)
    : NaN;
  const numericAmount = Number.isFinite(breakdownTotal) ? breakdownTotal : Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount > 0) {
    return jsonResponse(400, {
      message: "Zero-total checkout is only available when total amount is 0.00 or below.",
    });
  }

  const normalizedCurrency = (currency || "USD").toUpperCase();
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const normalizedVerification = normalizeVerificationPayload(verification || {});
  const resolvedPromoCode =
    (typeof promoCode === "string" && promoCode.trim()) ||
    (typeof breakdown?.promoCode === "string" && breakdown.promoCode.trim()) ||
    "";
  const resolvedPromoDiscountAmount = Number.isFinite(Number(promoDiscountAmount))
    ? Number(promoDiscountAmount)
    : Number.isFinite(Number(breakdown?.promoDiscountAmount))
      ? Number(breakdown.promoDiscountAmount)
      : 0;
  const resolvedPromoDiscountRate = Number.isFinite(Number(promoDiscountRate))
    ? Number(promoDiscountRate)
    : Number.isFinite(Number(breakdown?.promoDiscountRate))
      ? Number(breakdown.promoDiscountRate)
      : 0;

  const confirmationId = `FREE-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const baseUrl = getBaseUrl(event);
  let reservationId = null;

  try {
    const reservationPayload = buildGuestyReservationPayload({
      listingId,
      checkIn,
      checkOut,
      guests: Number(guests) || 1,
      guest,
      currency: normalizedCurrency,
      amount: numericAmount,
      breakdown,
    });
    const reservation = await createGuestyReservation(reservationPayload);
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
    amount,
    currency,
    breakdown,
    promoCode,
    promoDiscountAmount,
    promoDiscountRate,
    guest,
    consentText,
    consentAcceptedAt,
    consentSignerName,
    consentSignatureDataUrl,
    verification,
    cancelPath,
  } = body || {};

  if (!listingId || !checkIn || !checkOut || amount == null) {
    return jsonResponse(400, { message: "Missing listingId, dates, or amount" });
  }

  const breakdownTotal = breakdown && typeof breakdown === "object"
    ? Number(breakdown.total ?? breakdown.subtotal)
    : NaN;
  const numericAmount = Number.isFinite(breakdownTotal) ? breakdownTotal : Number(amount);
  const unitAmount = toStripeAmount(numericAmount, currency);
  if (!unitAmount || unitAmount <= 0) {
    return jsonResponse(400, { message: "Invalid amount" });
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
  const resolvedPromoCode =
    (typeof promoCode === "string" && promoCode.trim()) ||
    (typeof breakdown?.promoCode === "string" && breakdown.promoCode.trim()) ||
    "";
  const resolvedPromoDiscountAmount = Number.isFinite(Number(promoDiscountAmount))
    ? Number(promoDiscountAmount)
    : Number.isFinite(Number(breakdown?.promoDiscountAmount))
      ? Number(breakdown.promoDiscountAmount)
      : 0;
  const resolvedPromoDiscountRate = Number.isFinite(Number(promoDiscountRate))
    ? Number(promoDiscountRate)
    : Number.isFinite(Number(breakdown?.promoDiscountRate))
      ? Number(breakdown.promoDiscountRate)
      : 0;

  const breakdownFields =
    breakdown && typeof breakdown === "object"
      ? {
          bd_accommodation: breakdown.accommodation,
          bd_cleaning: breakdown.cleaning,
          bd_taxes: breakdown.taxes,
          bd_fees: breakdown.fees,
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
          currency: (currency || "USD").toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: listingTitle || "OneLuxStay reservation",
            description: `Check-in ${checkIn} - Check-out ${checkOut} - Guests ${guests || 1}`,
          },
        },
      },
    ],
    success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?${cancelQuery.toString()}`,
    metadata: {
      listingId: String(listingId),
      checkIn,
      checkOut,
      guests: String(guests || 1),
      amount: String(numericAmount),
      currency: (currency || "USD").toLowerCase(),
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
    currency: (currency || "USD").toUpperCase(),
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

  return jsonResponse(200, { url: session.url, id: session.id });
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
        return jsonResponse(500, { message: "Checkout failed", error: err.message });
      }
    }

    if (path === "/checkout-free" && event.httpMethod === "POST") {
      try {
        return await handleFreeCheckout(event);
      } catch (err) {
        return jsonResponse(500, { message: "Zero-total checkout failed", error: err.message });
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

    return jsonResponse(404, { message: "Not Found", path });
  } catch (err) {
    return jsonResponse(500, {
      message: "check-units handler failed",
      path,
      error: err?.message || String(err),
    });
  }
}
