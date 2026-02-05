import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";
const STRIPE_EVENT_STORE = "stripe-webhook-events";

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

const buildReservationPayload = (session) => {
  const metadata = session.metadata || {};
  const listingId = metadata.listingId;
  const checkIn = metadata.checkIn;
  const checkOut = metadata.checkOut;
  const guests = Number(metadata.guests) || 1;
  const amount = Number(metadata.amount || 0);

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

  if (Number.isFinite(amount) && amount > 0) {
    payload.money = { fareAccommodation: amount };
  }

  return payload;
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
    await writeStripeEvent(stripeEvent.id, {
      processedAt: Date.now(),
      reservationId: reservation?._id || reservation?.id || null,
      listingId: payload.listingId,
    });
    return jsonResponse(200, {
      received: true,
      reservationId: reservation?._id || reservation?.id || null,
    });
  } catch (err) {
    return jsonResponse(502, { message: "Guesty reservation failed", error: err.message });
  }
}
