import crypto from "node:crypto";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

// Adyen sends asynchronous payment-result notifications (important for redirect-based
// payment methods, and as a safety net if the synchronous /payments or /payments/details
// response in api-booking-payments.js / api-booking-payment-details.js was lost).
// Docs: https://docs.adyen.com/development-resources/webhooks/verify-hmac-signatures/

const HMAC_FIELDS = [
  "pspReference",
  "originalReference",
  "merchantAccountCode",
  "merchantReference",
  "amount.value",
  "amount.currency",
  "eventCode",
  "success",
];

export const getPath = (item = {}, path = "") =>
  path.split(".").reduce((value, key) => (value == null ? value : value[key]), item);

export const escapeHmacValue = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:");

export const isValidHmac = (item = {}, hmacKeyHex = "") => {
  const signature = item?.additionalData?.hmacSignature || "";
  if (!hmacKeyHex || !signature) return false;
  try {
    const dataString = HMAC_FIELDS.map((field) => escapeHmacValue(getPath(item, field))).join(":");
    const key = Buffer.from(hmacKeyHex, "hex");
    const expected = crypto.createHmac("sha256", key).update(Buffer.from(dataString, "utf-8")).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export const sessionIdFromMerchantReference = (merchantReference = "") => {
  const value = String(merchantReference || "");
  return value.startsWith("apaleo-") ? value.slice("apaleo-".length) : "";
};

// Conditional UPDATEs (only transition sessions still in PAYMENT_ACTION_REQUIRED, the
// state api-booking-payments.js leaves a session in while an async/redirect payment is
// outstanding) make this idempotent under Adyen's at-least-once delivery without needing
// a separate event log, unlike api-webhooks-apaleo.js which dedupes via
// apaleo_webhook_events (Apaleo events don't carry enough state on their own to make the
// target update self-idempotent). A session already moved on (READY_TO_BOOK, CONFIRMED,
// etc. via the synchronous response) is left untouched.
const applyAuthorisationResult = async (item = {}) => {
  const sessionId = sessionIdFromMerchantReference(item?.merchantReference);
  if (!sessionId) return;
  const success = String(item?.success || "").toLowerCase() === "true";
  const pspReference = String(item?.pspReference || "").slice(0, 120);

  if (success) {
    await supabaseRestRequest(
      `apaleo_booking_sessions?id=eq.${encodeURIComponent(sessionId)}&state=eq.PAYMENT_ACTION_REQUIRED`,
      {
        method: "PATCH",
        body: {
          payment_state: "AUTHORIZED",
          state: "READY_TO_BOOK",
          payment_reference: pspReference || undefined,
          updated_at: new Date().toISOString(),
        },
        prefer: "return=minimal",
      },
    ).catch(() => {});
  } else {
    await supabaseRestRequest(
      `apaleo_booking_sessions?id=eq.${encodeURIComponent(sessionId)}&state=eq.PAYMENT_ACTION_REQUIRED`,
      {
        method: "PATCH",
        body: { payment_state: "DECLINED", state: "PAYMENT_DECLINED", updated_at: new Date().toISOString() },
        prefer: "return=minimal",
      },
    ).catch(() => {});
  }
};

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const hmacKeyHex = String(process.env.ADYEN_HMAC_KEY || "").trim();
  const items = Array.isArray(body?.notificationItems) ? body.notificationItems : [];

  for (const entry of items) {
    const item = entry?.NotificationRequestItem;
    if (!item) continue;
    if (!isValidHmac(item, hmacKeyHex)) {
      console.warn("[adyen-webhook] invalid HMAC signature, skipping item", {
        merchantReference: item?.merchantReference,
        eventCode: item?.eventCode,
      });
      continue;
    }
    if (String(item?.eventCode || "").toUpperCase() !== "AUTHORISATION") continue;
    try {
      await applyAuthorisationResult(item);
    } catch (error) {
      console.error("[adyen-webhook] failed to apply notification", {
        merchantReference: item?.merchantReference,
        message: error?.message || String(error),
      });
    }
  }

  // Adyen requires a bare "[accepted]" response body, not JSON, to stop retrying.
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: "[accepted]",
  };
}
